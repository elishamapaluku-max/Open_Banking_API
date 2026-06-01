import RequestBuilder from '../components/sandbox/RequestBuilder';
import ResponseViewer from '../components/sandbox/ResponseViewer';

const Sandbox = () => {
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-blue-600 mb-2">API Sandbox</h1>
        <p className="text-slate-600">
          Test KipaAPI endpoints live. Construct your request parameters and view the standardized JSON response below.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <RequestBuilder />
        <ResponseViewer />
      </div>
    </div>
  );
};

export default Sandbox;