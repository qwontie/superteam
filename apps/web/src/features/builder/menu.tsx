import { cn, List, ListButton, Popover } from "@cladd-ui/react";
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  type TouchEvent,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export interface MenuItem {
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  key: string;
  label: string;
  run: () => void;
}

interface MenuState {
  id: number;
  items: MenuItem[];
  rect: DOMRect;
}

type OpenMenu = (items: MenuItem[], rect: DOMRect) => void;

const MenuContext = createContext<OpenMenu | null>(null);

const LONG_PRESS_MS = 520;
const NATIVE = "input,select,textarea";

const WIDTH = 240;
const ROW = 44;
const EDGE = 8;
const GAP = 4;

const fit = (rect: DOMRect, rows: number) => {
  const height = rows * ROW + EDGE * 2;
  const x = Math.max(
    EDGE,
    Math.min(rect.left, window.innerWidth - WIDTH - EDGE)
  );
  const below = rect.bottom + GAP + height <= window.innerHeight;
  const y = below ? rect.bottom : Math.max(EDGE, rect.top - height - GAP * 2);
  return new DOMRect(x, y, 0, 0);
};

function MenuRow({ close, item }: { close: () => void; item: MenuItem }) {
  const pick = useCallback(() => {
    close();
    item.run();
  }, [close, item]);
  return (
    <ListButton
      className={cn(item.danger && "text-pact-stop")}
      disabled={item.disabled}
      icon={item.icon}
      onClick={pick}
      size="xl"
    >
      {item.label}
    </ListButton>
  );
}

export function MenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const serial = useRef(0);
  const open = useCallback<OpenMenu>((items, rect) => {
    serial.current += 1;
    setMenu(
      items.length > 0
        ? { id: serial.current, items, rect: fit(rect, items.length) }
        : null
    );
  }, []);
  const close = useCallback(() => setMenu(null), []);
  const change = useCallback((next: boolean) => {
    if (!next) {
      setMenu(null);
    }
  }, []);
  return (
    <MenuContext value={open}>
      {children}
      {menu ? (
        <Popover
          anchorRect={menu.rect}
          className="w-60 max-w-[calc(100vw-1rem)]"
          key={menu.id}
          offset={GAP}
          onOpenChange={change}
          open
          position="bottom-start"
        >
          <List className="p-1.5">
            {menu.items.map((item) => (
              <MenuRow close={close} item={item} key={item.key} />
            ))}
          </List>
        </Popover>
      ) : null}
    </MenuContext>
  );
}

const pointRect = (x: number, y: number) => new DOMRect(x, y, 0, 0);

export const useMenu = (build: () => MenuItem[], enabled = true) => {
  const open = useContext(MenuContext);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef<boolean>(false);
  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const onContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest(NATIVE)) {
        event.stopPropagation();
        return;
      }
      if (!(open && enabled)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const keyboard = event.clientX === 0 && event.clientY === 0;
      open(
        build(),
        keyboard
          ? event.currentTarget.getBoundingClientRect()
          : pointRect(event.clientX, event.clientY)
      );
    },
    [build, enabled, open]
  );
  const onTouchStart = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      const touch = event.touches.item(0);
      if (
        !(open && enabled && touch) ||
        (event.target as HTMLElement).closest(NATIVE)
      ) {
        return;
      }
      event.stopPropagation();
      const { clientX, clientY } = touch;
      cancel();
      timer.current = setTimeout(() => {
        held.current = true;
        open(build(), pointRect(clientX, clientY));
      }, LONG_PRESS_MS);
    },
    [build, cancel, enabled, open]
  );
  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (held.current) {
      held.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);
  const openAt = useCallback(
    (element: HTMLElement) => {
      if (open && enabled) {
        const rect = element.getBoundingClientRect();
        setTimeout(() => open(build(), rect), 0);
      }
    },
    [build, enabled, open]
  );
  return useMemo(
    () => ({
      handlers: {
        onClickCapture,
        onContextMenu,
        onTouchCancel: cancel,
        onTouchEnd: cancel,
        onTouchMove: cancel,
        onTouchStart,
      },
      openAt,
    }),
    [cancel, onClickCapture, onContextMenu, onTouchStart, openAt]
  );
};
