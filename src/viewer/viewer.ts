import {
  CustomElement,
  Dispatch,
  DispatchEmitter,
  Listen,
  Prop,
  Watch
} from 'custom-elements-ts'
declare var PDFJS

@CustomElement({
  tag: 'o-viewer',
  templateUrl: './o-viewer.html',
  styleUrl: './o-viewer.css'
})
export class OrigonViewer extends HTMLElement {
  __url: string
  __raw: string
  __signatures: any[]

  @Dispatch() error: DispatchEmitter

  @Prop() url: string

  @Prop() raw: string

  @Prop() signatures: string

  @Watch('url')
  fetchPdf(): void {
    if (this.url !== this.url) {
      this.__url = this.url
      console.log(this.url)
      PDFJS.getDocument(this.url)
        .promise.then((data) => {
          console.log(data)
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

  @Listen('click', '#myButton') buttonClicked() {
    alert('le diste click')
  }

  constructor() {
    super()
  }
}
