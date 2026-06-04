const profile = async (req, res) => {
  res.status(200).json({ message: 'POST /analyze/profile — not yet implemented' });
};

const income = async (req, res) => {
  res.status(200).json({ message: 'POST /analyze/income — not yet implemented' });
};

module.exports = {
  profile,
  income
};
