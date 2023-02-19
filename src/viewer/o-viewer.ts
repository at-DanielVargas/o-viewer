import {
  CustomElement,
  Dispatch,
  DispatchEmitter,
  Listen,
  Prop,
  Toggle,
  Watch
} from 'custom-elements-ts'
declare const PDFJS
declare const Prism
import interactjs from 'interactjs'

@CustomElement({
  tag: 'o-viewer',
  templateUrl: './o-viewer.html',
  styleUrl: './o-viewer.css'
})
export class OrigonViewer extends HTMLElement {
  __url: string
  __raw: string
  __signatures: any[]
  __pdf: any
  __currentPage: number = 1
  __pageCount: number
  __zooms: number[] = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0]
  __zoom: number = 2
  __windowSize: number
  __xmlData: string
  __showXml: boolean = false
  __locales = {
    es: {
      show_pdf: 'Ver Pdf',
      show_xml: 'Ver Xml',
      download_error: 'Ocurrió un error al descargar el archivo...',
      loading_text: 'Cargando...'
    },
    en: {
      show_pdf: 'Show Pdf',
      show_xml: 'Show Xml',
      download_error: 'An error occurred while downloading the file',
      loading_text: 'Loading...'
    }
  }
  __displaySignatures: boolean
  __currentLang: any

  __elementSizes = {
    signatures: {
      width: 195,
      height: 139,
      font: 10
    }
  }

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
      const blobUrl = this.getUrlFromData(this.raw)
      PDFJS.getDocument(blobUrl)
        .promise.then((data) => {
          this.shadowRoot.querySelector('#document').scrollTo(0, 0)
          this.shadowRoot.querySelector('#document').innerHTML = ''
          this.shadowRoot.querySelector('.loader').classList.add('hidden')
          this.renderZoom()
          this.__pdf = data
          this.__pageCount = data.numPages
          this.preparePages()
          this.renderPage()
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
    const loadingText = (this.shadowRoot.querySelector<HTMLParagraphElement>(
      '#loadingText'
    ).innerText = this.__currentLang.loading_text)
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
            this.preparePages()
            this.renderPage()
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
    this.resizeElements()
  }

  @Listen('click', '#downZoom')
  downZoom() {
    if (this.__zoom === 0) return
    this.__zoom = this.__zoom - 1
    this.resizeElements()
    this.renderZoom()
  }

  @Listen('click', '#upZoom')
  upZoom() {
    if (this.__zoom === 5) return
    this.__zoom = this.__zoom + 1
    this.resizeElements()
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

          if (!rendered && pageNumber) {
            this.__currentPage = pageNumber
            this.renderPage()
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
      this.shadowRoot.querySelector('#document')?.appendChild(page)
    }
  }

  buildPage(
    number: number,
    container: HTMLDivElement,
    observer: IntersectionObserver
  ) {
    this.__pdf.getPage(1).then((page) => {
      const viewport = page.getViewport(this.__zooms[this.__zoom])
      const pdfPage = document.createElement('div')
      const canvas = document.createElement('canvas')
      const textLayer = document.createElement('div')

      pdfPage.className = 'pdf-page'
      textLayer.className = 'pdf-page-text'
      canvas.className = 'pdf-page-canvas'

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
            const viewport = page.getViewport(this.__zooms[this.__zoom])
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
        })
        pdfPage.appendChild(pageSignatures)
      }
      container.appendChild(pdfPage)
      observer.observe(container)
    })
  }

  renderPage() {
    this.__pdf.getPage(this.__currentPage).then((page) => {
      if (this.__currentPage === this.__pageCount) {
        this.lastPageRender.emit({ detail: { isRendered: true } })
      }
      const container = this.shadowRoot.querySelector(
        `.page-${this.__currentPage}`
      )
      if (container) {
        container.setAttribute('data-rendered', 'true')
        container.classList.remove('rendering')
        const pdfPage: HTMLDivElement = container.querySelector(`.pdf-page`)
        const textLayer: HTMLDivElement =
          pdfPage.querySelector(`.pdf-page-text`)
        const canvas: HTMLCanvasElement =
          pdfPage.querySelector(`.pdf-page-canvas`)

        const ctx = canvas.getContext('2d')
        const viewport = page.getViewport(this.__zooms[this.__zoom])

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
            .filter((s) => s.page === this.__currentPage)
            .forEach((signature) => {
              const card = document.createElement('div')
              card.style.top = `${signature.coords.y}px`
              card.style.left = `${signature.coords.x}px`
              card.className = 'signature'
              card.setAttribute('data-owner', `${signature.owner.id}`)
              card.setAttribute('data-top', `${signature.coords.y}`)
              card.setAttribute('data-left', `${signature.coords.x}`)
              const color = this.getColorFromEmail(signature.owner.email)
              card.innerHTML = `<div class="draw"><span class="fal fa-thumbtack circle" style="background-color: ${color};"></span></div><div class="data" style="background-color: ${color};"><div class="name">${signature.owner.name}</div><div class="email">${signature.owner.email}</div></div>`
              interactjs(card)
                .allowFrom('.circle')
                .draggable({
                  inertia: false,
                  autoScroll: { container: pageSignatures },
                  onmove: (event) => {
                    const target = event.target

                    const x =
                      (parseFloat(target.getAttribute('data-x')) || 0) +
                      event.dx
                    const y =
                      (parseFloat(target.getAttribute('data-y')) || 0) +
                      event.dy

                    target.style.webkitTransform = target.style.transform =
                      'translate(' + x + 'px, ' + y + 'px)'

                    target.setAttribute('data-x', x)
                    target.setAttribute('data-y', y)
                  }
                })
              pageSignatures.appendChild(card)
            })
        }

        const renderCtx = {
          canvasContext: ctx,
          viewport: viewport
        }

        page.render(renderCtx)

        page.getTextContent().then((text) => {
          const textContent = PDFJS.renderTextLayer({
            container: textLayer,
            pageIndex: page.pageIndex,
            viewport,
            textContent: text,
            textDivs: []
          })
        })
      }
    })
  }

  resizeElements() {
    const printResolution = this.__zoom * window.devicePixelRatio
    const renderedPages = this.shadowRoot.querySelectorAll(
      '.page[data-rendered="true"]'
    )
    for (let i = 0; i < renderedPages.length; i++) {
      this.__pdf.getPage(i + 1).then((page) => {
        const container = renderedPages[i]
        const pdfPage: HTMLDivElement = container.querySelector(`.pdf-page`)
        const textLayer: HTMLDivElement =
          pdfPage.querySelector(`.pdf-page-text`)
        const canvas: HTMLCanvasElement =
          pdfPage.querySelector(`.pdf-page-canvas`)

        const ctx = canvas.getContext('2d')
        const viewport = page.getViewport(this.__zooms[this.__zoom])

        pdfPage.style.height = `${viewport.height}px`
        pdfPage.style.width = `${viewport.width}px`
        canvas.height = viewport.height
        canvas.width = viewport.width
        canvas.style.width = `${Math.ceil(viewport.width / printResolution)}px`
        canvas.style.height = `${Math.ceil(
          viewport.height / printResolution
        )}px`
        textLayer.style.height = `${viewport.height}px`
        textLayer.style.width = `${viewport.width}px`
        textLayer.innerHTML = ''

        if (this.__displaySignatures) {
          const pageSignatures: HTMLDivElement = pdfPage.querySelector(
            '.pdf-page-signatures'
          )
          const signatures =
            pdfPage.querySelectorAll<HTMLDivElement>('.signature')

          pageSignatures.style.height = `${viewport.height}px`
          pageSignatures.style.width = `${viewport.width}px`

          const initialWidth = Math.floor(viewport.viewBox[2])
          const initialHeight = Math.floor(viewport.viewBox[3])
          const currentWidth = Math.floor(viewport.width)
          const currentHeight = Math.floor(viewport.height)
          const widthScaleFactor = currentWidth / initialWidth
          const heightScaleFactor = currentHeight / initialHeight

          for (let e = 0; e < signatures.length; e++) {
            const signature = signatures[e]
            if (this.__zoom > 2 || this.__zoom < 2) {
              signature.style.display = 'none'
            } else {
              signature.style.display = 'flex'

              const initialWidth = this.__elementSizes.signatures.width
              const initialHeight = this.__elementSizes.signatures.height
              const initialArea = initialWidth * initialHeight
              const currentArea =
                initialArea * widthScaleFactor * heightScaleFactor
              const scaleFactor = Math.sqrt(currentArea / initialArea)
              const newWidth = initialWidth * scaleFactor
              const newHeight = initialHeight * scaleFactor
              const initialX = parseInt(signature.getAttribute('data-left'))
              const initialY = parseInt(signature.getAttribute('data-top'))
              const currentX = initialX * widthScaleFactor
              const currentY = initialY * heightScaleFactor

              signature.style.width = newWidth + 'px'
              signature.style.height = newHeight + 'px'
              signature.style.left = currentX + 'px'
              signature.style.top = currentY + 'px'
            }
          }
        }

        const renderCtx = {
          canvasContext: ctx,
          viewport: viewport
        }

        page.render(renderCtx)

        page.getTextContent().then((text) => {
          const textContent = PDFJS.renderTextLayer({
            container: textLayer,
            pageIndex: page.pageIndex,
            viewport,
            textContent: text,
            textDivs: []
          })
        })
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
}
