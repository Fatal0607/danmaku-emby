import { Routes, Route } from 'react-router-dom'
import { AppShell } from './features/app-shell/AppShell'
import { Onboarding } from './features/onboarding/Onboarding'
import { Home } from './features/home/Home'
import { Library } from './features/library/Library'
import { Detail } from './features/detail/Detail'
import { Search } from './features/search/Search'
import { Player } from './features/player/Player'
import { Settings } from './features/settings/Settings'

export function App() {
  return (
    <Routes>
      {/* Full-bleed routes (no shell) */}
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/player/:id" element={<Player />} />

      {/* In-app routes wrapped by the glass shell */}
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/library/:kind" element={<Library />} />
        <Route path="/detail/:id" element={<Detail />} />
        <Route path="/search" element={<Search />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
