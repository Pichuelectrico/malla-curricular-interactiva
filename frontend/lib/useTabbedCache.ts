import { useCallback, useEffect, useRef, useState } from 'react';

export interface TabItem<T> {
  id: string;
  label: string;
  data: T;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function optionLabel(index: number): string {
  return `Opción ${String.fromCharCode(65 + index)}`;
}

export function useTabbedCache<T>({
  storageKey,
  isOpen,
  createDefaultData,
  defaultTabLabel = optionLabel,
}: {
  storageKey: string;
  isOpen: boolean;
  createDefaultData: () => T;
  defaultTabLabel?: (index: number) => string;
}) {
  const hydrated = useRef(false);
  const [tabs, setTabs] = useState<TabItem<T>[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');

  const persist = useCallback(
    (nextTabs: TabItem<T>[], nextActiveId: string) => {
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ tabs: nextTabs, activeTabId: nextActiveId }),
        );
      } catch {
        /* ignore quota errors */
      }
    },
    [storageKey],
  );

  useEffect(() => {
    if (!isOpen || hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          tabs: TabItem<T>[];
          activeTabId: string;
        };
        if (parsed.tabs?.length) {
          setTabs(parsed.tabs);
          setActiveTabId(
            parsed.activeTabId &&
              parsed.tabs.some((t) => t.id === parsed.activeTabId)
              ? parsed.activeTabId
              : parsed.tabs[0].id,
          );
          return;
        }
      }
    } catch {
      /* fall through */
    }
    const id = uid();
    const initial: TabItem<T>[] = [
      { id, label: defaultTabLabel(0), data: createDefaultData() },
    ];
    setTabs(initial);
    setActiveTabId(id);
    persist(initial, id);
  }, [isOpen, storageKey, createDefaultData, defaultTabLabel, persist]);

  useEffect(() => {
    if (!hydrated.current || tabs.length === 0) return;
    persist(tabs, activeTabId);
  }, [tabs, activeTabId, persist]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const updateActiveData = useCallback((data: T) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, data } : t)),
    );
  }, [activeTabId]);

  const addTab = useCallback(() => {
    const id = uid();
    setTabs((prev) => {
      const next = [
        ...prev,
        { id, label: defaultTabLabel(prev.length), data: createDefaultData() },
      ];
      return next;
    });
    setActiveTabId(id);
  }, [createDefaultData, defaultTabLabel]);

  const removeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((t) => t.id !== id);
        if (activeTabId === id) {
          setActiveTabId(next[0]?.id ?? '');
        }
        return next;
      });
    },
    [activeTabId],
  );

  const renameTab = useCallback((id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, label: trimmed } : t)),
    );
  }, []);

  const selectTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const replaceAllTabs = useCallback(
    (nextTabs: TabItem<T>[], nextActiveId?: string) => {
      setTabs(nextTabs);
      setActiveTabId(nextActiveId ?? nextTabs[0]?.id ?? '');
    },
    [],
  );

  return {
    tabs,
    activeTab,
    activeTabId,
    updateActiveData,
    addTab,
    removeTab,
    renameTab,
    selectTab,
    replaceAllTabs,
  };
}
