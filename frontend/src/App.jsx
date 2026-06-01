import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';

function App() {
  return (
    <Router>
      {/* flex-col and min-h-screen ensure the footer always stays at the bottom */}
      <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-900">
        <Navbar />
        
        {/* flex-grow pushes the footer down, taking up available space */}
        <main className="grow max-w-7xl mx-auto w-full px-4 py-8">
          <Routes>
            <Route path="/" element={<h1 className="text-3xl font-bold">KipaAPI Portal Skeleton</h1>} />
            {/* We will build and link the Landing, Docs, and Sandbox pages here next */}
          </Routes>
        </main>

        <Footer />
      </div>
    </Router>
  );
}

export default App;