import { apiClient } from "./client";
import type { Category, PaginatedResponse, Post, PostStatus, PostVisibility, Tag } from "../types/api";

export interface ListPostsParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: number;
  tags?: string;
  status?: PostStatus;
  visibility?: PostVisibility;
  author?: number;
  ordering?: string;
}

export async function listPosts(params: ListPostsParams = {}): Promise<PaginatedResponse<Post>> {
  const { data } = await apiClient.get<PaginatedResponse<Post>>("/posts/", { params });
  return data;
}

export async function getPost(id: number | string): Promise<Post> {
  const { data } = await apiClient.get<Post>(`/posts/${id}/`);
  return data;
}

export interface CreatePostPayload {
  title: string;
  description: string;
  image: File;
  category?: number | null;
  tags?: string[];
  visibility?: PostVisibility;
}

export async function createPost(payload: CreatePostPayload, onUploadProgress?: (percent: number) => void): Promise<Post> {
  const formData = new FormData();
  formData.append("title", payload.title);
  formData.append("description", payload.description);
  formData.append("image", payload.image);
  if (payload.category != null) {
    formData.append("category", String(payload.category));
  }
  if (payload.visibility) {
    formData.append("visibility", payload.visibility);
  }
  for (const tag of payload.tags ?? []) {
    formData.append("tags", tag);
  }
  const { data } = await apiClient.post<Post>("/posts/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: onUploadProgress
      ? (event) => {
          if (event.total) {
            onUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        }
      : undefined,
  });
  return data;
}

export async function updatePost(id: number, payload: Partial<Pick<Post, "title" | "description" | "category" | "visibility">> & { tags?: string[] }): Promise<Post> {
  const { data } = await apiClient.patch<Post>(`/posts/${id}/`, payload);
  return data;
}

export async function deletePost(id: number): Promise<void> {
  await apiClient.delete(`/posts/${id}/`);
}

export async function hidePost(id: number, reason?: string): Promise<Post> {
  const { data } = await apiClient.post<Post>(`/posts/${id}/hide/`, { reason });
  return data;
}

export async function restorePost(id: number): Promise<Post> {
  const { data } = await apiClient.post<Post>(`/posts/${id}/restore/`);
  return data;
}

export async function listCategories(): Promise<PaginatedResponse<Category>> {
  const { data } = await apiClient.get<PaginatedResponse<Category>>("/categories/");
  return data;
}

export async function listTags(search?: string): Promise<PaginatedResponse<Tag>> {
  const { data } = await apiClient.get<PaginatedResponse<Tag>>("/tags/", { params: { search } });
  return data;
}
