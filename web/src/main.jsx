import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { ToastProvider } from './components/ui.jsx';
import { AppProvider } from './lib/store.jsx';
import { DialogsProvider } from './components/dialogs.jsx';

createRoot(document.getElementById('root')).render(
  <ToastProvider><AppProvider><DialogsProvider><App /></DialogsProvider></AppProvider></ToastProvider>
);
