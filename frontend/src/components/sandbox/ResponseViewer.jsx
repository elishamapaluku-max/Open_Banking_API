const ResponseViewer = () => {
  return (
    <div className="bg-slate-900 rounded-lg shadow-sm border border-slate-800 flex flex-col h-full min-h-75">
      <div className="px-4 py-2 bg-slate-800 border-b border-slate-700 rounded-t-lg flex justify-between items-center">
        <h2 className="text-sm font-mono text-slate-300">Response</h2>
        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded">200 OK</span>
      </div>
      <div className="p-4 grow overflow-auto">
        <pre className="text-green-400 font-mono text-sm whitespace-pre-wrap">
          {`{\n  "success": true,\n  "message": "Awaiting request...",\n  "data": {}\n}`}
        </pre>
      </div>
    </div>
  );
};

export default ResponseViewer;