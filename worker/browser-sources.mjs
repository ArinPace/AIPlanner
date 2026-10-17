// Shared by connection setup, profile selection, and agent reads. New entries
// inherit regular Chrome automatically; browser policy is not a site allowlist.
export const sources = {
  brightspace: 'https://brightspace.nyu.edu/', gradescope: 'https://www.gradescope.com/',
  gmail: 'https://mail.google.com/mail/u/0/', calendar: 'https://calendar.google.com/calendar/u/0/r',
  drive: 'https://drive.google.com/drive/u/0/my-drive', slack: 'https://app.slack.com/',
  albert: 'https://albert.nyu.edu/', whatsapp: 'https://web.whatsapp.com/',
  instagram: 'https://www.instagram.com/', x: 'https://x.com/home',
}
