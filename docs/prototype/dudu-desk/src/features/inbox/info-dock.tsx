import { AnimatePresence, motion } from "motion/react";
import type { Visitor } from "../../types";
import type { Inbox } from "./use-inbox";
import { VisitorInfo } from "./visitor-info";

export function InfoDock({
  open,
  visitor,
  inbox,
  onClose,
}: {
  open: boolean;
  visitor: Visitor;
  inbox: Inbox;
  onClose: () => void;
}) {
  return (
    <div className="info-dock" data-open={open} inert={!open}>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="info-dock-content"
            initial={{ x: 18, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 18, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <VisitorInfo
              key={visitor.id}
              visitor={visitor}
              inbox={inbox}
              onClose={onClose}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
