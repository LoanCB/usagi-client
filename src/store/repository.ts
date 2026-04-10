// Module-level singleton — initialized once at app startup.
// All stores receive the repository via function arguments,
// making them testable without this module.

import type { TodoRepository } from "@/db/repository";

let _repository: TodoRepository | null = null;

export function setRepository(repo: TodoRepository) {
  _repository = repo;
}

export function getRepository(): TodoRepository {
  if (!_repository) throw new Error("Repository not initialized. Call setRepository() first.");
  return _repository;
}
