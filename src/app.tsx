import { InstallHint } from './core/components/InstallHint';
import { TabBar } from './core/components/TabBar';
import { UpdateToast } from './core/components/UpdateToast';
import { Placeholder } from './features/placeholder';
import { useRoute, type Route } from './router';

const TITLES: Record<Route, string> = {
  dashboard: 'Torque',
  schedule: 'Schedule',
  history: 'History',
  costs: 'Costs',
  settings: 'Settings',
};

export function App() {
  const route = useRoute();
  return (
    <>
      <header class="app-header">{TITLES[route]}</header>
      <main class="app-main">
        {route === 'dashboard' && <InstallHint />}
        <Placeholder title={TITLES[route]} />
      </main>
      <TabBar current={route} />
      <UpdateToast />
    </>
  );
}
