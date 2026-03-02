import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Models from './pages/Models';
import CreateModel from './pages/CreateModel';
import Upload from './pages/Upload';
import Train from './pages/Train';
import Test from './pages/Test';
import Download from './pages/Download';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/models" element={<Models />} />
        <Route path="/create" element={<CreateModel />} />
        <Route path="/upload/:modelId" element={<Upload />} />
        <Route path="/train/:modelId" element={<Train />} />
        <Route path="/test" element={<Test />} />
        <Route path="/download" element={<Download />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
