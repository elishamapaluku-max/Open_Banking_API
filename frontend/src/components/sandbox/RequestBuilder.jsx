const RequestBuilder = () => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <h2 className="text-xl font-bold text-slate-900 mb-4">Request Builder</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Select Endpoint</label>
          <select className="w-full border-slate-300 rounded-md shadow-sm p-2 border focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
            <option value="GET /accounts/123/balance">GET /accounts/123/balance</option>
            <option value="GET /accounts/123/transactions">GET /accounts/123/transactions</option>
            <option value="POST /analyze/profile">POST /analyze/profile</option>
          </select>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 w-full font-medium transition-colors">
          Send Request
        </button>
      </div>
    </div>
  );
};

export default RequestBuilder;