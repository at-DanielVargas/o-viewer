const canvas = document.getElementById('pdf-canvas')
const container = document.getElementById('pdf-container')
const url = 'ruta-del-archivo-pdf'
let pdfDoc = null
let pagesCache = {}
let pageNum = 1
let pageRendering = false
let pageNumPending = null
let scale = 1.5

// Configuración del renderizador
const renderPage = (num) => {
  pageRendering = true
  // Obtener la página del documento PDF
  pdfDoc.getPage(num).then((page) => {
    const viewport = page.getViewport({ scale })
    canvas.height = viewport.height
    canvas.width = viewport.width

    // Renderizar la página en el canvas
    const renderContext = {
      canvasContext: canvas.getContext('2d'),
      viewport: viewport
    }
    const renderTask = page.render(renderContext)

    // Esperar a que la página se renderice completamente
    renderTask.promise.then(() => {
      pageRendering = false
      if (pageNumPending !== null) {
        renderPage(pageNumPending)
        pageNumPending = null
      }
    })
  })

  // Actualizar el número de página en la página HTML
  document.getElementById('page-num').textContent = num
}

// Cargar el archivo PDF
const loadPdf = () => {
  pdfjsLib
    .getDocument(url)
    .promise.then((pdfDoc_) => {
      pdfDoc = pdfDoc_
      document.getElementById('page-count').textContent = pdfDoc.numPages
      renderPage(pageNum)
      cachePages()
    })
    .catch((error) => {
      console.error(error)
    })
}

// Cachear todas las páginas del PDF
const cachePages = () => {
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    pdfDoc.getPage(i).then((page) => {
      const viewport = page.getViewport({ scale })
      const canvasCache = document.createElement('canvas')
      canvasCache.height = viewport.height
      canvasCache.width = viewport.width
      const renderContext = {
        canvasContext: canvasCache.getContext('2d'),
        viewport: viewport
      }
      page.render(renderContext).promise.then(() => {
        pagesCache[i] = canvasCache
      })
    })
  }
}

// Control de eventos para navegar entre páginas
document.getElementById('prev-page').addEventListener('click', () => {
  if (pageNum <= 1) {
    return
  }
  pageNum--
  queue
  // Renderizar la página anterior
  if (!pageRendering) {
    renderPage(pageNum)
  } else {
    pageNumPending = pageNum
  }
})

document.getElementById('next-page').addEventListener('click', () => {
  if (pageNum >= pdfDoc.numPages) {
    return
  }
  pageNum++
  queueRenderPage(pageNum)
})

container.addEventListener('scroll', () => {
  const currentTop = container.scrollTop
  const currentBottom = currentTop + container.clientHeight
  const currentPage = Math.floor(currentTop / canvas.height) + 1
  const firstVisiblePage = Math.max(currentPage - 1, 1)
  const lastVisiblePage = Math.min(
    Math.ceil(currentBottom / canvas.height),
    pdfDoc.numPages
  )
  for (let i = firstVisiblePage; i <= lastVisiblePage; i++) {
    if (!(i in pagesCache)) {
      // Renderizar y cachear la página
      pdfDoc.getPage(i).then((page) => {
        const viewport = page.getViewport({ scale })
        const canvasCache = document.createElement('canvas')
        canvasCache.height = viewport.height
        canvasCache.width = viewport.width
        const renderContext = {
          canvasContext: canvasCache.getContext('2d'),
          viewport: viewport
        }
        page.render(renderContext).promise.then(() => {
          pagesCache[i] = canvasCache
          const canvasElement = document.createElement('canvas')
          canvasElement.height = viewport.height
          canvasElement.width = viewport.width
          canvasElement.getContext('2d').drawImage(canvasCache, 0, 0)
          container.appendChild(canvasElement)
        })
      })
    } else if (!container.querySelector(`[data-page-number="${i}"]`)) {
      // Agregar la página al contenedor
      const canvasElement = document.createElement('canvas')
      canvasElement.height = pagesCache[i].height
      canvasElement.width = pagesCache[i].width
      canvasElement.dataset.pageNumber = i
      canvasElement.getContext('2d').drawImage(pagesCache[i], 0, 0)
      container.appendChild(canvasElement)
    }
  }
})

const queueRenderPage = (num) => {
  if (pageRendering) {
    pageNumPending = num
  } else {
    renderPage(num)
  }
}
