import {
  CustomElement,
  Dispatch,
  DispatchEmitter,
  Listen,
  Prop,
  Watch
} from 'custom-elements-ts'
import PDFJS, {
  PageViewport,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask
} from 'pdfjs-dist'
declare const Prism: any
import interactjs from 'interactjs'
import { SignaturePosition } from './interfaces'
import { RenderParameters } from 'pdfjs-dist/types/src/display/api'

PDFJS.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS.version}/build/pdf.worker.min.js`

export interface IViewport {
  viewBox: number[]
  scale: number
  rotation: number
  offsetX: number
  offsetY: number
  transform: number[]
  width: number
  height: number
  fontScale: number
}

@CustomElement({
  tag: 'o-viewer',
  templateUrl: './o-viewer.html',
  styleUrl: './o-viewer.css'
})
export class OrigonViewer extends HTMLElement {
  __url!: string
  __raw!: string
  __signatures!: SignaturePosition[]
  __pdf!: PDFDocumentProxy
  __pendingForRender: number = 1
  __currentPageScroll!: number
  __pageCount!: number
  __zooms: number[] = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0]
  __zoom: number = 2
  __windowSize!: number
  __xmlData!: string
  __showXml: boolean = false
  __applyingZoom: boolean = false
  __pageRendering: boolean = false
  __pageNumPending!: number | null
  __locales = {
    es: {
      show_pdf: 'Ver Pdf',
      show_xml: 'Ver Xml',
      download_error: 'Ocurrió un error al descargar el archivo...',
      loading_text: 'Cargando...',
      signatureError: 'La posición de firma no puede colocarse entre 2 páginas'
    },
    en: {
      show_pdf: 'Show Pdf',
      show_xml: 'Show Xml',
      download_error: 'An error occurred while downloading the file',
      loading_text: 'Loading...',
      signatureError: 'Signature position cannot be placed between 2 pages'
    }
  }
  __displaySignatures: boolean = false
  __currentLang: any

  __elementSizes = {
    signatures: {
      width: 195,
      height: 139,
      font: 10
    }
  }

  __renderTask!: { promise: Promise<RenderTask>; cancel: () => void }
  __renderTasks: any[] = []

  @Dispatch() error: DispatchEmitter
  @Dispatch() signatureChanged: DispatchEmitter
  @Dispatch() lastPageRender: DispatchEmitter
  @Dispatch() pdfData: DispatchEmitter

  @Prop() url: string
  @Prop() raw: string
  @Prop() signatures: string
  @Prop() hasXml: boolean
  @Prop() xmlData: string
  @Prop() displaySignatures: string
  @Prop() lang: string = 'es'

  @Watch('raw')
  parseRaw() {
    if (this.raw !== '' && this.raw !== 'null' && this.raw !== 'undefined') {
      const blobUrl = this.getUrlFromData(this.detectAndParseRaw(this.raw))
      PDFJS.getDocument(blobUrl)
        .promise.then((data) => {
          const document =
            this.shadowRoot.querySelector<HTMLDivElement>('#document')
          document?.scrollTo(0, 0)
          document.innerHTML = ''

          this.shadowRoot
            .querySelector<HTMLDivElement>('.loader')
            ?.classList.add('hidden')

          this.renderZoom()
          this.__pdf = data
          this.__pageCount = data.numPages
          this.preparePages()
        })
        .catch((error) => {
          this.error.emit({
            detail: {
              error
            }
          })
        })
    }
  }

  @Watch('displaySignatures')
  seSignatures() {
    this.__displaySignatures = this.displaySignatures === 'false' ? false : true
  }

  @Watch('lang')
  setLang() {
    this.__currentLang = this.__locales[`${this.lang}`]
    const button =
      this.shadowRoot.querySelector<HTMLButtonElement>('#xmlToggle')
    this.shadowRoot.querySelector<HTMLParagraphElement>(
      '#loadingText'
    ).innerText = this.__currentLang.loading_text
    button.innerHTML = this.__showXml
      ? this.__currentLang.show_pdf
      : this.__currentLang.show_xml
  }

  @Watch('xmlData')
  formatXmlData() {
    if (!this.xmlData || this.xmlData === 'null') return
    const button = this.shadowRoot.querySelector('#xmlToggle')
    button.classList.remove('hidden')
    let formatted = ''
    let indent = ''
    const tab = '\t'
    const xmlSplitted = this.xmlData.split(/>\s*</)

    xmlSplitted.forEach((node: string) => {
      if (node.match(/^\/\w/)) {
        indent = indent.substring(tab.length)
      }
      formatted += indent + '<' + node + '>\r\n'
      if (node.match(/^<?\w[^>]*[^/]$/)) {
        indent += tab
      }
    })

    this.__xmlData = formatted.substring(1, formatted.length - 3)
    this.shadowRoot.querySelector(
      '#xml'
    ).innerHTML = `<pre><code>${Prism.highlight(
      this.__xmlData,
      Prism.languages.xml
    )}</code></pre>`
  }

  @Watch('url')
  fetchPdf(): void {
    this.__windowSize = this.shadowRoot.querySelector('.wrapper').clientWidth
    if (this.url && this.__url !== this.url) {
      this.__url = this.url
      this.shadowRoot.querySelector('.loader').classList.remove('hidden')
      this.downloadPdfAndConvertToBase64(this.url).then((b64) => {
        const blobUrl = this.getUrlFromData(b64)
        PDFJS.getDocument(blobUrl)
          .promise.then((data) => {
            this.shadowRoot.querySelector('#document').scrollTo(0, 0)
            this.shadowRoot.querySelector('#document').innerHTML = ''
            this.shadowRoot.querySelector('.loader').classList.add('hidden')
            this.renderZoom()
            this.__pdf = data
            this.__pageCount = data.numPages
            const totalCounter: HTMLDivElement =
              this.shadowRoot.querySelector('.total')
            totalCounter.innerText = String(data.numPages)
            this.preparePages()
          })
          .catch((error) => {
            this.error.emit({
              detail: {
                error
              }
            })
          })
      })
    }
  }

  @Watch('signatures')
  parseSignatures(): void {
    const decoded = JSON.parse(decodeURIComponent(this.signatures))
    this.__signatures = decoded
    this.resizeElements({ clear: true, fromParse: true })
  }

  @Listen('click', '#downZoom')
  downZoom() {
    if (this.__zoom === 0 || this.__applyingZoom) return
    this.__zoom = this.__zoom - 1
    document.documentElement.style.setProperty(
      '--scale-factor',
      String(this.__zooms[this.__zoom])
    )
    this.resizeElements({ fromZoom: true })
    this.renderZoom()
  }

  @Listen('click', '#upZoom')
  upZoom() {
    if (this.__zoom === 5 || this.__applyingZoom) return
    this.__zoom = this.__zoom + 1
    document.documentElement.style.setProperty(
      '--scale-factor',
      String(this.__zooms[this.__zoom])
    )
    this.resizeElements({ fromZoom: true })
    this.renderZoom()
  }

  @Listen('click', '#xmlToggle')
  toggleXml() {
    const xmlContainer = this.shadowRoot.querySelector('#xml')
    const xmlButtonToggleTextElement: HTMLButtonElement =
      this.shadowRoot.querySelector('#xmlToggle')

    this.__showXml = !this.__showXml
    this.__showXml
      ? xmlContainer.classList.remove('hidden')
      : xmlContainer.classList.add('hidden')
    this.__showXml
      ? (xmlButtonToggleTextElement.innerHTML = this.__currentLang.show_pdf)
      : (xmlButtonToggleTextElement.innerHTML = this.__currentLang.show_xml)
  }

  constructor() {
    super()
    document.documentElement.style.setProperty('--scale-factor', '1')
  }

  renderZoom() {
    const container: HTMLInputElement = this.shadowRoot.querySelector('#zoom')
    container.value = this.__zooms[this.__zoom] * 100 + '%'
  }

  preparePages() {
    const observer = new IntersectionObserver(
      (entries) => {
        const showedEntries = entries.filter(
          (entry) => entry.intersectionRatio >= 0.1
        )
        showedEntries.forEach((entry) => {
          const rendered = entry.target.getAttribute('data-rendered')
          const pageNumber = parseInt(entry.target.getAttribute('data-page'))
          const loader = entry.target.querySelector('.page-loader')
          loader.classList.add('hidden')
          const currentIndicator: HTMLDivElement =
            this.shadowRoot.querySelector('.current')
          currentIndicator.textContent = String(pageNumber)
          this.__currentPageScroll = pageNumber
          if (!rendered) {
            this.__pendingForRender = pageNumber
            this.renderPage(pageNumber)
          }
        })
      },
      {
        threshold: 0.1,
        rootMargin: '0px',
        root: this.shadowRoot.querySelector('#document')
      }
    )

    for (let i = 1; i <= this.__pageCount; i++) {
      const page = document.createElement('div')
      this.buildPage(i, page, observer)
      this.shadowRoot.querySelector('#document').appendChild(page)
    }
  }

  buildPage(
    number: number,
    container: HTMLDivElement,
    observer: IntersectionObserver
  ) {
    this.__pdf.getPage(number).then((page: PDFPageProxy) => {
      const viewport = page.getViewport({ scale: this.__zooms[this.__zoom] })
      const pdfPage = document.createElement('div')
      const loader = document.createElement('div')
      const canvas = document.createElement('canvas')
      const textLayer = document.createElement('div')

      pdfPage.className = 'pdf-page'
      textLayer.className = 'pdf-page-text'
      canvas.className = 'pdf-page-canvas'

      const clone: HTMLTemplateElement =
        this.shadowRoot.querySelector('#loaderSVG')
      loader.appendChild(clone.content.cloneNode(true))
      loader.classList.add('page-loader')

      container.className = `page page-number page-${number} rendering`
      container.setAttribute('data-page', number.toString())

      pdfPage.style.height = `${viewport.height}px`
      pdfPage.style.width = `${viewport.width}px`
      canvas.height = viewport.height
      canvas.width = viewport.width
      textLayer.style.height = `${viewport.height}px`
      textLayer.style.width = `${viewport.width}px`

      pdfPage.appendChild(canvas)
      pdfPage.appendChild(textLayer)
      pdfPage.appendChild(loader)

      if (this.__displaySignatures) {
        const getPositionRelativeTo = (
          referenceElement: HTMLDivElement,
          targetElement: HTMLDivElement
        ): { x: number; y: number } => {
          const referencePosition = referenceElement.getBoundingClientRect()
          const targetPosition = targetElement.getBoundingClientRect()
          const x = Math.round(targetPosition.left - referencePosition.left)
          const y = Math.round(targetPosition.top - referencePosition.top)
          return { x, y }
        }

        const pageSignatures = document.createElement('div')
        pageSignatures.className = 'pdf-page-signatures'
        pageSignatures.setAttribute('data-page', number.toString())
        pageSignatures.setAttribute(
          'data-original-width',
          String(viewport.viewBox[2])
        )
        pageSignatures.setAttribute(
          'data-original-height',
          String(viewport.viewBox[3])
        )
        pageSignatures.style.height = `${viewport.height}px`
        pageSignatures.style.width = `${viewport.width}px`
        interactjs(pageSignatures).dropzone({
          accept: '.signature',
          ondropmove: (e) => {
            this.shadowRoot
              .querySelectorAll('.pdf-page-signatures')
              .forEach((element: HTMLDivElement) => {
                element.style.backgroundColor = 'rgba(0,0,0,.08)'
              })
          },
          ondrop: (event) => {
            const viewport = page.getViewport({
              scale: this.__zooms[this.__zoom]
            })
            const droppedElement: HTMLDivElement = event.relatedTarget
            const targetContainer: HTMLDivElement = event.target
            this.shadowRoot
              .querySelectorAll('.pdf-page-signatures')
              .forEach((element: HTMLDivElement) => {
                element.style.backgroundColor = 'transparent'
              })

            const { x, y } = getPositionRelativeTo(
              targetContainer,
              droppedElement
            )
            const { x: newX, y: newY } = this.calculatePositionsOnResize(
              x,
              y,
              viewport.width,
              viewport.height,
              viewport.viewBox[2],
              viewport.viewBox[3]
            )
            if (
              newY >
              viewport.viewBox[3] - this.__elementSizes.signatures.height / 2
            ) {
              droppedElement.style.top = `${droppedElement.getAttribute(
                'data-top'
              )}px`
              droppedElement.style.left = `${droppedElement.getAttribute(
                'data-left'
              )}px`
              droppedElement.style.transform = ''
              droppedElement.removeAttribute('data-x')
              droppedElement.removeAttribute('data-y')
              this.error.emit({
                detail: {
                  message: this.__currentLang.signatureError,
                  code: 'signature.positions'
                }
              })
            } else {
              this.signatureChanged.emit({
                detail: {
                  owner: {
                    id: parseInt(droppedElement.getAttribute('data-owner'))
                  },
                  coords: {
                    page: parseInt(event.target.getAttribute('data-page')),
                    y: newY,
                    x: newX
                  }
                }
              })
            }
          }
        })
        pdfPage.appendChild(pageSignatures)
      }
      container.appendChild(pdfPage)
      observer.observe(container)
    })
  }

  generateCardAndAppendToContainer(
    signature: SignaturePosition,
    container: HTMLDivElement,
    viewport: PageViewport
  ): void {
    const cardExists: HTMLDivElement | null = container.querySelector(
      `.signature[data-owner="${signature.owner.id}"]`
    )
    if (cardExists) {
      cardExists.style.top = `${signature.coords.y}px`
      cardExists.style.left = `${signature.coords.x}px`
      cardExists.setAttribute('data-top', `${signature.coords.y}`)
      cardExists.setAttribute('data-left', `${signature.coords.x}`)
      this.scaleSignature(container, viewport)
      return
    }
    const card = document.createElement('div')
    card.style.top = `${signature.coords.y}px`
    card.style.left = `${signature.coords.x}px`
    card.className = 'signature'
    card.setAttribute('data-owner', `${signature.owner.id}`)
    card.setAttribute('data-top', `${signature.coords.y}`)
    card.setAttribute('data-left', `${signature.coords.x}`)
    const color = this.getColorFromEmail(signature.owner.email)
    const textColor = this.getTextColorFromBackgroundColor(color)
    card.innerHTML = `<div class="draw"><span class="fal fa-thumbtack circle" style="background-color: ${color};"></span></div><div class="data" style="background-color: ${color};"><div class="name" style="color: ${textColor};">${signature.owner.name}</div><div class="email" style="color: ${textColor};">${signature.owner.email}</div></div>`
    interactjs(card)
      .allowFrom('.circle')
      .draggable({
        inertia: false,
        autoScroll: { container },
        onmove: (event) => {
          const target = event.target

          const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx
          const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy

          target.style.webkitTransform = target.style.transform =
            'translate(' + x + 'px, ' + y + 'px)'

          target.setAttribute('data-x', x)
          target.setAttribute('data-y', y)
        }
      })

    container.appendChild(card)
    this.scaleSignature(container, viewport)
  }

  renderPage(pageNum?: number) {
    if (!this.__renderTasks.some((task) => task.page === pageNum)) {
      this.__renderTasks.push({ page: pageNum, state: 'pending' })
    } else {
      this.__renderTasks = this.__renderTasks.map((task) => ({
        ...task,
        state: 'pending'
      }))
    }
    this.__pageRendering = true
    this.__pdf
      .getPage(pageNum ? pageNum : this.__pendingForRender)
      .then((page: PDFPageProxy) => {
        if (this.__pendingForRender === this.__pageCount) {
          this.lastPageRender.emit({ detail: { isRendered: true } })
        }
        const container = this.shadowRoot.querySelector(
          `.page-${pageNum ? pageNum : this.__pendingForRender}`
        )

        if (container) {
          container.setAttribute('data-rendered', 'true')
          container.classList.remove('rendering')
          const pdfPage: HTMLDivElement = container.querySelector(`.pdf-page`)
          const textLayer: HTMLDivElement =
            pdfPage.querySelector(`.pdf-page-text`)
          const canvas: HTMLCanvasElement =
            pdfPage.querySelector(`.pdf-page-canvas`)
          const loader = pdfPage.querySelector('.page-loader')
          const ctx = canvas.getContext('2d')
          const viewport = page.getViewport({
            scale: this.__zooms[this.__zoom]
          })

          pdfPage.style.height = `${viewport.height}px`
          pdfPage.style.width = `${viewport.width}px`
          canvas.height = viewport.height
          canvas.width = viewport.width
          textLayer.style.height = `${viewport.height}px`
          textLayer.style.width = `${viewport.width}px`
          textLayer.innerHTML = ''

          if (this.__displaySignatures) {
            const pageSignatures: HTMLDivElement =
              pdfPage.querySelector(`.pdf-page-signatures`)
            this.__signatures
              .filter((s) => s.page === pageNum)
              .forEach((signature) => {
                this.generateCardAndAppendToContainer(
                  signature,
                  pageSignatures,
                  viewport
                )
              })
          }
          ctx.clearRect(0, 0, viewport.width, viewport.height)
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, viewport.width, viewport.height)

          const renderCtx = {
            canvasContext: ctx,
            viewport: viewport
          }

          const [up, down] = [
            this.shadowRoot.querySelector('#upZoom') as HTMLButtonElement,
            this.shadowRoot.querySelector('#downZoom') as HTMLButtonElement
          ]

          this.__renderTask = this.cancelableRenderTask(page, renderCtx)
          this.__renderTask.promise.then(() => {
            page.getTextContent().then((text) => {
              const textContent = PDFJS.renderTextLayer({
                container: textLayer,
                viewport,
                textContentSource: text,
                textDivs: []
              })
            })

            this.__applyingZoom = false
            setTimeout(
              () => {
                up.removeAttribute('disabled')
                down.removeAttribute('disabled')
              },
              this.__zoom > 1 ? 400 : 200
            )
          })
          this.__renderTask.promise.catch((e) => {})
          this.__renderTask.promise.finally(() => {
            this.__renderTasks = this.__renderTasks.map((task) => ({
              ...task,
              state: 'rendered'
            }))
            loader.classList.add('hidden')
          })
        }
      })
  }

  resizeElements(
    props: { clear?: boolean; fromZoom?: boolean; fromParse?: boolean } = {
      fromParse: true
    }
  ) {
    const [up, down] = [
      this.shadowRoot.querySelector('#upZoom') as HTMLButtonElement,
      this.shadowRoot.querySelector('#downZoom') as HTMLButtonElement
    ]
    this.__applyingZoom = true
    const renderedPages = this.shadowRoot.querySelectorAll<HTMLDivElement>(
      '.page[data-rendered="true"]'
    )
    for (let i = 0; i < renderedPages.length; i++) {
      const pageNumber = parseInt(renderedPages[i].getAttribute('data-page'))
      this.__pdf.getPage(pageNumber).then((page: PDFPageProxy) => {
        const container: HTMLDivElement = renderedPages[i]
        const pdfPage: HTMLDivElement = container.querySelector(`.pdf-page`)
        const textLayer: HTMLDivElement =
          pdfPage.querySelector(`.pdf-page-text`)
        const canvas: HTMLCanvasElement =
          pdfPage.querySelector(`.pdf-page-canvas`)
        const loader = container.querySelector('.page-loader')
        const viewport = page.getViewport({
          scale: this.__zooms[this.__zoom]
        })
        if (props.fromZoom) {
          up.setAttribute('disabled', 'true')
          down.setAttribute('disabled', 'true')
          loader.classList.remove('hidden')
        }
        if (props.fromParse) {
          loader.classList.remove('hidden')
        }

        pdfPage.style.height = `${viewport.height}px`
        pdfPage.style.width = `${viewport.width}px`
        canvas.height = viewport.height
        canvas.width = viewport.width
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        textLayer.style.height = `${viewport.height}px`
        textLayer.style.width = `${viewport.width}px`
        textLayer.innerHTML = ''

        if (this.__displaySignatures) {
          const pageSignatures: HTMLDivElement = pdfPage.querySelector(
            '.pdf-page-signatures'
          )

          pageSignatures.style.height = `${viewport.height}px`
          pageSignatures.style.width = `${viewport.width}px`

          if (props.clear) {
            pageSignatures
              .querySelectorAll('.signature')
              .forEach((signatureCard) => {
                signatureCard.remove()
              })
          }
        }

        this.renderPage(pageNumber)
      })
    }
  }

  getColorFromEmail(email: string) {
    const hash = email.split('').reduce(function (prev, next) {
      return (prev << 5) - prev + next.charCodeAt(0)
    }, 0)

    let color = (hash & 0x00ffffff).toString(16).toUpperCase()

    while (color.length < 6) {
      color = '0' + color
    }

    return '#' + color
  }

  getTextColorFromBackgroundColor(bgColor: string) {
    const [r, g, b] = [
      parseInt(bgColor.substr(1, 2), 16),
      parseInt(bgColor.substr(3, 2), 16),
      parseInt(bgColor.substr(5, 2), 16)
    ]
    const brightness = (r * 299 + g * 587 + b * 114) / 1000

    if (brightness >= 128) {
      return '#000000'
    } else {
      return '#ffffff'
    }
  }

  calculatePositionsOnResize(
    x: number,
    y: number,
    originalWidth: number,
    originalHeight: number,
    newWidth: number,
    newHeight: number
  ) {
    const newX = Math.floor(x * (newWidth / originalWidth))
    const newY = Math.floor(y * (newHeight / originalHeight))
    return { x: newX, y: newY }
  }

  downloadPdfAndConvertToBase64(pdfUrl: string): Promise<string> {
    return fetch(pdfUrl)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => {
        const base64String = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ''
          )
        )
        this.pdfData.emit({ detail: base64String })
        return base64String
      })
  }

  getUrlFromData(b64: string) {
    const byteCharacters = atob(b64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'application/pdf' })
    return URL.createObjectURL(blob)
  }

  scaleSignature(parent: HTMLDivElement, viewport: PageViewport) {
    const signatures = parent.querySelectorAll<HTMLDivElement>('.signature')
    const originalScale = 10

    signatures.forEach((signature: HTMLDivElement) => {
      const originalWidth = this.__elementSizes.signatures.width
      const originalHeight = this.__elementSizes.signatures.height
      const newWidth = (originalWidth * viewport.width) / viewport.viewBox[2]
      const newHeight = (originalHeight * viewport.height) / viewport.viewBox[3]

      const originalX = parseInt(signature.getAttribute('data-left'))
      const originalY = parseInt(signature.getAttribute('data-top'))

      const newX = (originalX * parent.offsetWidth) / viewport.viewBox[2]
      const newY = (originalY * parent.offsetHeight) / viewport.viewBox[3]

      const newScale =
        (parent.offsetWidth / viewport.viewBox[2]) * originalScale

      signature.style.width = `${newWidth}px`
      signature.style.height = `${newHeight}px`
      signature.style.left = `${newX}px`
      signature.style.top = `${newY}px`
      signature.style.fontSize = `${newScale}px`
      if (this.__zooms[this.__zoom] < 1 || this.__zooms[this.__zoom] > 1) {
        signature.style.display = 'none'
      } else {
        signature.style.display = 'flex'
      }
    })
  }

  isElementVisible(
    container: HTMLDivElement,
    element: HTMLDivElement,
    isPartial: boolean = false
  ) {
    const containerRect = container.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()

    const isVisible =
      (isPartial &&
        elementRect.top < containerRect.bottom &&
        elementRect.bottom > containerRect.top &&
        elementRect.left < containerRect.right &&
        elementRect.right > containerRect.left) ||
      (!isPartial &&
        elementRect.top >= containerRect.top &&
        elementRect.bottom <= containerRect.bottom &&
        elementRect.left >= containerRect.left &&
        elementRect.right <= containerRect.right)

    return isVisible
  }

  detectAndParseRaw(raw: string) {
    let b64: string = decodeURIComponent(raw)
    if (b64.indexOf('application/pdf') !== -1) {
      b64 = b64.split(',').pop() ?? ''
    }
    return b64
  }

  cancelableRenderTask(
    page: PDFPageProxy,
    context: RenderParameters
  ): { promise: Promise<any>; cancel: () => void } {
    let renderTask = page.render(context)
    let isCanceled = false

    const wrappedPromise = new Promise<RenderTask>((resolve: any, reject) => {
      renderTask.promise.then(() => {
        if (!isCanceled) {
          resolve()
        } else {
          reject({ isCanceled: true })
        }
      })
      renderTask.promise.catch((error) => {
        if (!isCanceled) {
          reject(error)
        } else {
          reject({ isCanceled: true })
        }
      })
    })

    return {
      promise: wrappedPromise,
      cancel() {
        isCanceled = true
        renderTask.cancel(0)
      }
    }
  }
}
