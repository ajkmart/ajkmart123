/**
 * expo-task-manager web shim
 * Background tasks are not supported in the browser — all functions are no-ops.
 */

export function defineTask(_name, _fn) {}

export async function isTaskRegisteredAsync(_name) {
  return false;
}

export async function getRegisteredTasksAsync() {
  return [];
}

export async function unregisterAllTasksAsync() {}

export async function unregisterTaskAsync(_name) {}

export async function getTaskOptionsAsync(_name) {
  return null;
}
