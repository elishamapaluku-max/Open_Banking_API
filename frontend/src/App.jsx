import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Landing from './pages/Landing'; 
import Docs from './pages/Docs';
import Sandbox from './pages/Sandbox';
import Assistant from './pages/Assistant';

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-900">
        <Navbar />
        
        <main className="grow max-w-7xl mx-auto w-full px-4 py-8">
          <Routes>
            <Route path="/" element={<Landing />} />
            {/* 2. Add the Docs route */}
            <Route path="/docs" element={<Docs />} />
            {/* 3. Add the Sandbox route */}
            <Route path="/sandbox" element={<Sandbox />} />
            {/* 4. Add the Assistant route */}
            <Route path="/assistant" element={<Assistant />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </Router>
  );
}

export default App;