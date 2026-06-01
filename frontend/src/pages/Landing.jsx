import { Link } from 'react-router-dom';

const Landing = () => {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-16 bg-white rounded-lg shadow-sm border border-slate-100">
        <h1 className="text-4xl font-bold text-blue-600 mb-4">
          Open Banking Infrastructure for East Africa
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
          KipaAPI is a unified platform aggregating financial data from banks and mobile money operators into a single, developer-friendly interface powered by Claude.
        </p>
        <div className="flex justify-center space-x-4">
          <Link to="/docs" className="bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 transition-colors">
            Read the Docs
          </Link>
          <Link to="/sandbox" className="bg-blue-600 text-white px-6 py-3 rounded-md font-medium border border-slate-300 hover:bg-blue-700 transition-colors">
            Try the Sandbox
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="grid md:grid-cols-3 gap-6">
        <div className="p-6 bg-white rounded-lg shadow-sm border border-slate-100">
          <h3 className="text-xl font-bold text-slate-900 mb-2">Layer 1: Data Ingestion</h3>
          <p className="text-slate-600">Connects to bank APIs, M-Pesa Daraja API, and parses uploaded bank statements.</p>
        </div>
        <div className="p-6 bg-white rounded-lg shadow-sm border border-slate-100">
          <h3 className="text-xl font-bold text-slate-900 mb-2">Layer 2: Normalization Engine</h3>
          <p className="text-slate-600">Standardizes all data into a unified schema regardless of source bank or format.</p>
        </div>
        <div className="p-6 bg-white rounded-lg shadow-sm border border-slate-100">
          <h3 className="text-xl font-bold text-slate-900 mb-2">Layer 3: AI Intelligence</h3>
          <p className="text-slate-600">Categorizes transactions, detects income patterns, and generates borrower profiles in plain English.</p>
        </div>
      </section>
    </div>
  );
};

export default Landing;