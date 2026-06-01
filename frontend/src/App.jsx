import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Landing from './pages/Landing'; // <-- Add this import

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-900">
        <Navbar />
        
        <main className="grow max-w-7xl mx-auto w-full px-4 py-8">
          <Routes>
            {/* Replace the skeleton h1 with the Landing component */}
            <Route path="/" element={<Landing />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </Router>
  );
}

export default App;