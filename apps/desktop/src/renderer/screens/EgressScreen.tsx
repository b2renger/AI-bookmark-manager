import { EgressIcon, EmptyState } from '@cairn/ui';
import { useT } from '../i18n/useT';

// A top-level nav item, not a Settings sub-page (TECHNICAL-DESIGN §6.1): every byte that leaves
// the device is listed here. In P0 nothing can leave, so the table is empty by construction —
// the columns are already the final ones so P1's egress_log drops straight in.

const COLUMNS = ['time', 'host', 'purpose', 'bytes', 'result', 'bookmark'] as const;

export function EgressScreen() {
  const t = useT('egress');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line-1 bg-surface-1 px-4 py-3">
        <h1 className="text-sm font-semibold text-fg-1">{t('egress.title')}</h1>
        <p className="text-xs text-fg-3">{t('egress.subtitle')}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface-1 text-[11px] uppercase tracking-wider text-fg-3">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} className="border-b border-line-1 px-3 py-2 font-semibold">
                  {t(`egress.column.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={COLUMNS.length}>
                <EmptyState
                  icon={<EgressIcon className="h-6 w-6" />}
                  title={t('egress.empty.title')}
                  description={t('egress.empty.body')}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
