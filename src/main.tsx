import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app mount node');

createRoot(app).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
