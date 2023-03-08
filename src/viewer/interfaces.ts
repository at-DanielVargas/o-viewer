export interface SignaturePosition {
  attachmentId: number
  owner: Owner
  page: number
  coords: Coords
}

export interface Owner {
  id: number
  name: string
  email: string
}

export interface Coords {
  x: number
  y: number
}
