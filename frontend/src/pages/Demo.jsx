const Demo = () => {
  const steps = [
    {
      title: "1. User Consent",
      description: "User authenticates directly via bank or M-Pesa OAuth. KipaAPI receives a scoped, read-only token.",
      status: "complete"
    },
    {
      title: "2. Data Ingestion & Normalization",
      description: "Raw transaction data is pulled and standardized into a unified KipaAPI schema.",
      status: "active"
    },
    {
      title: "3. Claude Analysis",
      description: "The AI layer categorizes spending, detects income, and generates the narrative.",
      status: "pending"
    },
    {
      title: "4. Final Output",
      description: "The lender receives a clean JSON response with the generated borrower profile.",
      status: "pending"
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">End-to-End Demo</h1>
        <p className="text-slate-600">
          Walk through the KipaAPI data aggregation and analysis pipeline.
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="space-y-6">
          {steps.map((step, index) => (
            <div key={index} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step.status === 'complete' ? 'bg-green-100 text-green-700' : 
                  step.status === 'active' ? 'bg-blue-600 text-white' : 
                  'bg-slate-100 text-slate-400'
                }`}>
                  {index + 1}
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-0.5 h-full my-2 ${step.status === 'complete' ? 'bg-green-200' : 'bg-slate-200'}`}></div>
                )}
              </div>
              <div className="pb-6">
                <h3 className={`text-lg font-bold ${step.status === 'pending' ? 'text-slate-500' : 'text-slate-900'}`}>
                  {step.title}
                </h3>
                <p className={`${step.status === 'pending' ? 'text-slate-400' : 'text-slate-600'} mt-1`}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Demo;