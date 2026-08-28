import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './permission-panel-overrides.css';
import './dashboard-overrides.css';
import './region-directory.css';
import './ui-ux-overrides.css';
import './record-attachments.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
