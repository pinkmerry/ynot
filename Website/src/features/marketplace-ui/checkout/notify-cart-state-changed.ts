export function notifyCartStateChanged(
  onCartStateChanged?: () => void | Promise<void>,
): void {
  void Promise.resolve()
    .then(() => onCartStateChanged?.())
    .catch(() => undefined);
}
