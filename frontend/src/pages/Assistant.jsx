import ChatWidget from '../components/assistant/ChatWidget';

const Assistant = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Developer Assistant</h1>
        <p className="text-slate-600">
          Need help integrating KipaAPI? Ask Claude directly to debug errors, generate code snippets, or explain our normalized transaction schema.
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <ChatWidget />
      </div>
    </div>
  );
};

export default Assistant;