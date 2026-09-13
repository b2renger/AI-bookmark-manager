// @cairn/ui — presentational components only. They receive data, callbacks and `t` as props;
// they never import window.cairn, Zustand or i18next. Ported in P0 task 14 (TECHNICAL-DESIGN §6.3).

export * from './types.js';
export * from './icons/index.js';

export { Spinner } from './Spinner.js';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button.js';
export {
  Input,
  Select,
  Textarea,
  type InputProps,
  type SelectOption,
  type SelectProps,
  type TextareaProps,
} from './Input.js';

export { EditableField, type EditableFieldProps } from './EditableField.js';
export {
  ConfidenceBadge,
  confidenceLevel,
  CONFIDENCE_HIGH,
  CONFIDENCE_MODERATE,
  type ConfidenceBadgeProps,
  type ConfidenceLevel,
} from './ConfidenceBadge.js';
export {
  PlatformBadge,
  detectPlatform,
  type DetectedPlatform,
  type PlatformBadgeProps,
} from './PlatformBadge.js';

export { BulkActionBar, type BulkActionBarProps } from './BulkActionBar.js';
export { FilterBar, type FilterBarProps, type FilterValue } from './FilterBar.js';
export { BookmarkTable, ROW_HEIGHT, type BookmarkTableProps } from './BookmarkTable.js';
export { BookmarkDrawer, type BookmarkDrawerProps, type DrawerField } from './BookmarkDrawer.js';

export { DedupeReport, type DedupeReportProps } from './DedupeReport.js';
export {
  ColumnMapper,
  CANONICAL_FIELDS,
  type CanonicalFieldKey,
  type ColumnMapperProps,
} from './ColumnMapper.js';
export {
  ImportProgress,
  IMPORT_PHASES,
  type ImportPhaseKey,
  type ImportProgressProps,
} from './ImportProgress.js';

export { Toast, type ToastItem, type ToastKind, type ToastProps } from './Toast.js';
export { EmptyState, type EmptyStateProps } from './EmptyState.js';
