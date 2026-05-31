const getInstitutions = async (req, res) => {
  const institutions = [
    { id: 'equity', name: 'Equity Bank', country: 'KE' },
    { id: 'kcb', name: 'KCB Bank', country: 'KE' },
    { id: 'mpesa', name: 'M-Pesa', country: 'KE' },
    { id: 'coop', name: 'Co-op Bank', country: 'KE' }
  ];

  res.status(200).json(institutions);
};

module.exports = {
  getInstitutions
};
