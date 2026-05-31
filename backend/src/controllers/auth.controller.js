const connect = async (req, res) => {
  res.status(200).json({
    authUrl: 'https://mock-bank.co.ke/oauth?client_id=kipaapi&scope=read:transactions'
  });
};

const callback = async (req, res) => {
  res.status(200).json({ message: 'GET /auth/callback — not yet implemented' });
};

const revoke = async (req, res) => {
  res.status(200).json({ message: 'POST /auth/revoke — not yet implemented' });
};

module.exports = {
  connect,
  callback,
  revoke
};
