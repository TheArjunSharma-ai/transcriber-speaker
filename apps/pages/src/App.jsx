import Studio from '../../web/src/components/studio.jsx'
import { useRoute } from './navigation.jsx'

function App() {
  const path = useRoute()
  const project = /^\/projects\/([a-f0-9-]{36})$/.exec(path)
  const view = project ? 'project' : path === '/library' ? 'library' : path === '/settings' ? 'settings' : 'dashboard'
  return <Studio key={path} view={view} projectId={project?.[1]} />
}

export default App
