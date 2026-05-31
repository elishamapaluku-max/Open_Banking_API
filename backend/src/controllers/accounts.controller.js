const getBalance = async (req, res) => {
  res.status(200).json({ message: 'GET /accounts/:id/balance — not yet implemented' });
};

const getTransactions = async (req, res) => {
  res.status(200).json({ message: 'GET /accounts/:id/transactions — not yet implemented' });
};

module.exports = {
  getBalance,
  getTransactions
};
