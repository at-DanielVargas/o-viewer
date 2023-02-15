import {
  CustomElement,
  Dispatch,
  DispatchEmitter,
  Listen,
  Prop,
  Watch
} from 'custom-elements-ts'
declare var PDFJS
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

  @Dispatch() error: DispatchEmitter

  @Dispatch() signatureChanged: DispatchEmitter

  @Prop() url: string

  @Prop() raw: string

  @Prop() signatures: string

  @Watch('url')
  fetchPdf(): void {
    console.log(this.shadowRoot.querySelector('.wrapper').clientWidth)
    if (this.__url !== this.url) {
      this.__url = this.url
      PDFJS.getDocument(this.url)
        .promise.then((data) => {
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

  @Watch('signatures')
  parseSignatures(): void {
    const decoded = JSON.parse(decodeURIComponent(this.signatures))
    this.__signatures = decoded
  }

  @Listen('click', '#downZoom') downZoom() {
    if (this.__zoom === 0) return
    this.__zoom = this.__zoom - 1
    this.resizeElements()
    this.renderZoom()
  }

  @Listen('click', '#upZoom') upZoom() {
    if (this.__zoom === 5) return
    this.__zoom = this.__zoom + 1
    this.resizeElements()
    this.renderZoom()
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
      const pageSignatures = document.createElement('div')

      pdfPage.className = 'pdf-page'
      textLayer.className = 'pdf-page-text'
      canvas.className = 'pdf-page-canvas'
      pageSignatures.className = 'pdf-page-signatures'
      container.className = `page page-number page-${number} rendering`
      container.setAttribute('data-page', number.toString())
      pageSignatures.setAttribute('data-page', number.toString())

      pageSignatures.style.height = `${viewport.height}px`
      pageSignatures.style.width = `${viewport.width}px`

      interactjs(pageSignatures).dropzone({
        accept: '.signature',
        ondrop: (event) => {
          const droppedElement = event.relatedTarget
          this.signatureChanged.emit({
            detail: {
              owner: {
                id: parseInt(droppedElement.getAttribute('data-owner'))
              },
              coords: {
                page: parseInt(event.target.getAttribute('data-page')),
                y:
                  parseFloat(droppedElement.getAttribute('data-y')) +
                  parseFloat(droppedElement.getAttribute('data-top')),
                x:
                  parseFloat(droppedElement.getAttribute('data-x')) +
                  parseFloat(droppedElement.getAttribute('data-left'))
              }
            }
          })
        }
      })

      pdfPage.style.height = `${viewport.height}px`
      pdfPage.style.width = `${viewport.width}px`
      canvas.height = viewport.height
      canvas.width = viewport.width
      textLayer.style.height = `${viewport.height}px`
      textLayer.style.width = `${viewport.width}px`

      pdfPage.appendChild(canvas)
      pdfPage.appendChild(textLayer)
      pdfPage.appendChild(pageSignatures)
      container.appendChild(pdfPage)
      observer.observe(container)
    })
  }

  renderPage() {
    this.__pdf.getPage(this.__currentPage).then((page) => {
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
        const pageSignatures: HTMLDivElement =
          pdfPage.querySelector(`.pdf-page-signatures`)
        const ctx = canvas.getContext('2d')
        const viewport = page.getViewport(this.__zooms[this.__zoom])

        pdfPage.style.height = `${viewport.height}px`
        pdfPage.style.width = `${viewport.width}px`
        canvas.height = viewport.height
        canvas.width = viewport.width
        textLayer.style.height = `${viewport.height}px`
        textLayer.style.width = `${viewport.width}px`
        textLayer.innerHTML = ''

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
            card.innerHTML = `<div class="draw">
    <span class="fal fa-thumbtack circle"></span>
  </div>
  <div class="data">
    <div class="name">${signature.owner.name}</div>
    <div class="email">${signature.owner.email}</div>
  </div>
`
            interactjs(card)
              .allowFrom('.circle')
              .draggable({
                inertia: false,
                autoScroll: { container: pageSignatures },
                onmove(event) {
                  var target = event.target

                  var x =
                    (parseFloat(target.getAttribute('data-x')) || 0) + event.dx
                  var y =
                    (parseFloat(target.getAttribute('data-y')) || 0) + event.dy

                  // console.log({
                  //   coords: {
                  //     y: (event.target.offsetTop + y),
                  //     x: (event.target.offsetLeft + x)
                  //   },
                  // })

                  // translate the element
                  target.style.webkitTransform = target.style.transform =
                    'translate(' + x + 'px, ' + y + 'px)'

                  // update the posiion attributes
                  target.setAttribute('data-x', x)
                  target.setAttribute('data-y', y)
                }
              })
            pageSignatures.appendChild(card)
          })

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
        const pageSignatures: HTMLDivElement = pdfPage.querySelector(
          '.pdf-page-signatures'
        )
        const signatures =
          pdfPage.querySelectorAll<HTMLDivElement>('.signature')
        const ctx = canvas.getContext('2d')
        const viewport = page.getViewport(this.__zooms[this.__zoom])

        pdfPage.style.height = `${viewport.height}px`
        pdfPage.style.width = `${viewport.width}px`
        canvas.height = viewport.height
        canvas.width = viewport.width
        textLayer.style.height = `${viewport.height}px`
        textLayer.style.width = `${viewport.width}px`
        textLayer.innerHTML = ''
        pageSignatures.style.height = `${viewport.height}px`
        pageSignatures.style.width = `${viewport.width}px`

        for (let e = 0; e < signatures.length; e++) {
          const prevTop = parseInt(signatures[e].getAttribute('data-top'))
          const prevLeft = parseInt(signatures[e].getAttribute('data-left'))

          signatures[e].style.width = `${
            195 *
            (pdfPage.offsetWidth / viewport.width) *
            this.__zooms[this.__zoom]
          }px`
          signatures[e].style.height = `${
            139 *
            (pdfPage.offsetHeight / viewport.height) *
            this.__zooms[this.__zoom]
          }px`
          signatures[e].style.top = `${
            prevTop *
            (pdfPage.offsetHeight / viewport.height) *
            this.__zooms[this.__zoom]
          }px`
          signatures[e].style.left = `${
            prevLeft *
            (pdfPage.offsetWidth / viewport.width) *
            this.__zooms[this.__zoom]
          }px`

          const fontSize = `${
            10 *
            (signatures[e].offsetWidth /
              (195 *
                (pdfPage.offsetWidth / viewport.width) *
                this.__zooms[this.__zoom])) *
            this.__zooms[this.__zoom]
          }px`
          const dataContainer: HTMLDivElement =
            signatures[e].querySelector('.data')
          dataContainer.style.fontSize = fontSize
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
}
