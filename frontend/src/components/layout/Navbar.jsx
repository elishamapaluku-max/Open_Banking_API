import { Link } from 'react-router-dom';

const Navbar = () => {
  return (
    <nav className="bg-slate-900 text-white p-4 shadow-md">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="text-2xl font-bold text-blue-400">
          <Link to="/">KipaAPI</Link>
        </div>
        <div className="space-x-6">
          <Link to="/docs" className="hover:text-blue-300 transition-colors">Docs</Link>
          <Link to="/sandbox" className="hover:text-blue-300 transition-colors">Sandbox</Link>
          {/* New Assistant Link */}
          <Link to="/assistant" className="hover:text-blue-300 transition-colors items-center gap-1 inline-flex">
            <span>Claude AI</span>
          </Link>
          <Link to="/demo" className="hover:text-blue-300 transition-colors">Demo</Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;