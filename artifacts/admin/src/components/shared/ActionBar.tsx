import type { ReactNode } from "react";

/**
 * Shared action bar used at the top of list/table pages.
 *
 * Wraps primary and secondary actions in a responsive container that
 * aligns right on desktop and wraps on mobile. Pair with PageHeader's
 * `actions` prop for simple headers, or use ActionBar standalone below
 * a FilterBar when the actions row is separate.
 *
 * Usage:
 *   <ActionBar
 *     primary={<Button onClick={…}>Create New</Button>}
 *     secondary={<Button variant="outline" onClick={exportCSV}>Export CSV</Button>}
 *   />
 */

export interface ActionBarProps {
  primary?: ReactNode;
  secondary?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function ActionBar({ primary, secondary, children, className = "" }: ActionBarProps) {
  return (
    <div className={`flex flex-wrap items-center justify-end gap-2 ${className}`}>
      {secondary}
      {primary}
      {children}
    </div>
  );
}
