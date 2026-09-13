import { EmptyState, SparklesIcon } from '@cairn/ui';
import { SCREEN_PHASE, type Screen } from '../state';
import { useT } from '../i18n/useT';

// Nav shape is final from day one; the screens that land later say when (§6.1).
export function PlaceholderScreen({ screen }: { screen: Screen }) {
  const t = useT('common');
  return (
    <EmptyState
      icon={<SparklesIcon className="h-6 w-6" />}
      title={t(`nav.${screen}`)}
      description={t('placeholder.body', { phase: SCREEN_PHASE[screen] })}
    />
  );
}
