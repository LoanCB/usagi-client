import { create } from "zustand";
import type { Tag, CreateTagInput } from "@/types";
import type { TodoRepository } from "@/db/repository";

interface TagStore {
  tags: Tag[];
  loadTags(repo: TodoRepository): Promise<void>;
  createTag(repo: TodoRepository, input: CreateTagInput): Promise<Tag>;
  updateTag(repo: TodoRepository, id: string, patch: Partial<CreateTagInput>): Promise<void>;
  deleteTag(repo: TodoRepository, id: string): Promise<void>;
}

export const useTagStore = create<TagStore>((set) => ({
  tags: [],

  async loadTags(repo) {
    const tags = await repo.getTags();
    set({ tags });
  },

  async createTag(repo, input) {
    const tag = await repo.createTag(input);
    set((s) => ({ tags: [...s.tags, tag] }));
    return tag;
  },

  async updateTag(repo, id, patch) {
    const updated = await repo.updateTag(id, patch);
    set((s) => ({ tags: s.tags.map((t) => (t.id === id ? updated : t)) }));
  },

  async deleteTag(repo, id) {
    await repo.deleteTag(id);
    set((s) => ({ tags: s.tags.filter((t) => t.id !== id) }));
  },
}));
