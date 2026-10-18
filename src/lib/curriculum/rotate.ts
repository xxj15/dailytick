/**
 * 분야마다 하나씩 돌아가며 꺼낸다. 분야 순서는 목록에 처음 나온 순서이고,
 * 분야 안에서는 원래 순서(쉬운 것부터)를 지킨다. 한 분야만 며칠씩 이어지지 않게 한다.
 */
export function rotateByCategory<T>(items: T[], key: (item: T) => string = (item) => (item as { category: string }).category): T[] {
  const queues = new Map<string, T[]>();
  for (const item of items) queues.set(key(item), [...(queues.get(key(item)) ?? []), item]);

  const rotated: T[] = [];
  while (rotated.length < items.length) {
    for (const queue of queues.values()) {
      const next = queue.shift();
      if (next !== undefined) rotated.push(next);
    }
  }
  return rotated;
}
