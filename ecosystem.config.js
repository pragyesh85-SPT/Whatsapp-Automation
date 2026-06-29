// pm2 process file. One process runs the whole Coaching OS.
//   pm2 start ecosystem.config.js      (start)
//   pm2 logs coaching-os               (watch logs / scan the WhatsApp QR here)
//   pm2 save                           (persist across reboot — see README for Windows boot)
module.exports = {
  apps: [
    {
      name: 'coaching-os',
      script: 'src/index.js',
      cwd: __dirname,
      max_memory_restart: '700M',   // guard the 4 GB-ish working set on this laptop
      restart_delay: 5000,
      env: { NODE_ENV: 'production' },
      out_file: 'logs/out.log',
      error_file: 'logs/err.log',
      time: true,
    },
  ],
};
