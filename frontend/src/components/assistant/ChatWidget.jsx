const ChatWidget = () => {
  return (
    <div className="bg-white rounded-lg shadow-md border border-slate-200 flex flex-col h-125">
      <div className="bg-blue-600 text-white p-4 rounded-t-lg">
        <h3 className="font-bold">Claude Developer Assistant</h3>
        <p className="text-xs text-blue-100">Ask me anything about KipaAPI endpoints or errors.</p>
      </div>
      <div className="grow p-4 overflow-y-auto space-y-4 bg-slate-50">
        {/* Placeholder for chat messages */}
        <div className="bg-white border border-slate-200 text-slate-700 p-3 rounded-lg max-w-[80%] shadow-sm">
          Hello! I'm your KipaAPI integration assistant powered by Claude. How can I help you today?
        </div>
      </div>
      <div className="p-4 border-t border-slate-200 bg-white rounded-b-lg">
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Type your question..." 
            className="grow border border-slate-300 rounded-md p-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
          />
          <button className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWidget;