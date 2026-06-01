const Docs = () => {
  const endpoints = [
    { method: 'POST', path: '/auth/connect', desc: 'Initiate OAuth flow for a user + institution' },
    { method: 'GET', path: '/accounts/{id}/balance', desc: 'Return current balance for linked account' },
    { method: 'GET', path: '/accounts/{id}/transactions', desc: 'Return paginated transaction history' },
    { method: 'POST', path: '/analyze/profile', desc: 'Claude generates borrower profile from transaction data' },
    { method: 'POST', path: '/analyze/income', desc: 'Claude estimates monthly income from transaction patterns' },
    { method: 'POST', path: '/parse/statement', desc: 'Upload PDF/CSV bank statement for parsing (fallback)' },
    { method: 'GET', path: '/institutions', desc: 'List all supported banks and mobile money operators' }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-blue-600 mb-2">API Documentation</h1>
        <p className="text-slate-600">
          Complete reference for KipaAPI's REST endpoints. Base URL: <code className="bg-slate-100 px-2 py-1 rounded text-blue-600">https://api.kipaapi.com/v1</code>
        </p>
      </div>

      <div className="space-y-4">
        {endpoints.map((endpoint, index) => (
          <div key={index} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-3 md:w-1/3">
              <span className={`px-3 py-1 text-sm font-bold rounded ${endpoint.method === 'GET' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {endpoint.method}
              </span>
              <code className="text-slate-800 font-mono text-sm">{endpoint.path}</code>
            </div>
            <p className="text-slate-600 text-sm md:w-2/3">{endpoint.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Docs;