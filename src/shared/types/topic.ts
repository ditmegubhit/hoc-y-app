export interface Topic {
  id: string
  parentId: string | null
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreateTopicInput {
  parentId: string | null
  name: string
}

export interface UpdateTopicInput {
  id: string
  name?: string
  parentId?: string | null
  sortOrder?: number
}
