import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Landing from './pages/Landing'; 
import Docs from './pages/Docs'; 

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
          </Routes>
        </main>

        <Footer />
      </div>
    </Router>
  );
}

export default App;