import test from 'node:test'
import assert from 'node:assert/strict'
import { signedInPage, brightspaceCourse,albertLanding } from './site-status.mjs'

test('Albert and WhatsApp confirmation rejects login/QR walls and accepts authenticated evidence',()=>{
  assert.equal(signedInPage('linkedin','https://www.linkedin.com/feed/','My Network Messaging Notifications'),true)
  assert.equal(signedInPage('linkedin','https://www.linkedin.com/login','My Network Messaging Notifications'),false)
  assert.equal(signedInPage('linkedin','https://www.linkedin.com.evil.test/feed/','My Network Messaging Notifications'),false)
  assert.equal(signedInPage('albert','https://albert.nyu.edu/','NYU Albert Sign in NetID Password'),false)
  assert.equal(signedInPage('albert','https://sis.nyu.edu/psc/csprod/EMPLOYEE/SA/c/SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL','Student Center My Class Schedule'),true)
  assert.equal(signedInPage('albert','https://sis.nyu.edu/psc/csprod/','Student Homepage NetID Change password'),true)
  assert.equal(signedInPage('albert','https://sis.portal.nyu.edu/psp/ihprod/EMPLOYEE/EMPL/h/','Albert Academics Enrolled Courses Sign Out'),true)
  assert.equal(signedInPage('albert','https://sis.portal.nyu.edu/psp/ihprod/EMPLOYEE/EMPL/h/','Albert STUDENT APPLICANT OTHER RESOURCES FAVORITES LOG OUT'),true)
  assert.equal(signedInPage('albert','https://sis.portal.nyu.edu/psp/ihprod/EMPLOYEE/EMPL/h/','Albert STUDENT APPLICANT OTHER RESOURCES FAVORITES'),false)
  assert.equal(signedInPage('albert','https://sis.portal.nyu.edu/psp/ihprod/EMPLOYEE/EMPL/h/','Albert Academics',true),false)
  assert.equal(signedInPage('albert','https://sis.portal.nyu.edu/login','Sign in NetID Password'),false)
  assert.equal(signedInPage('albert','https://sis.portal.nyu.edu.evil.test/','Academics Enrolled Courses Sign Out'),false)
  assert.equal(signedInPage('albert','https://sis.nyu.edu.evil.test/','Student Center Academics'),false)
  assert.equal(signedInPage('whatsapp','https://web.whatsapp.com/','Log into WhatsApp Scan the QR code'),false)
  assert.equal(signedInPage('whatsapp','https://web.whatsapp.com/','Chats Communities Search New chat'),true)
  assert.equal(signedInPage('whatsapp','https://web.whatsapp.com/','Chats Search',true),false)
})

test('sign-in confirmation requires the correct site and authenticated page evidence', () => {
  assert.equal(signedInPage('brightspace','https://brightspace.nyu.edu/d2l/home/123','Welcome to Brightspace. Course Home Content'),true)
  assert.equal(signedInPage('gradescope','https://www.gradescope.com/courses/123','Assignments Course Dashboard'),true)
  assert.equal(signedInPage('gradescope','https://www.gradescope.com/','Your Courses Account Course Dashboard'),true)
  assert.equal(signedInPage('gradescope','https://www.gradescope.com/','Welcome to Gradescope. Sign up to manage your courses.'),false)
  assert.equal(signedInPage('gmail','https://mail.google.com/mail/u/0/#inbox','Inbox Compose'),true)
  for (const href of ['https://accounts.google.com/login','https://mail.google.com.evil.test/mail/u/0/','https://mail.google.com/mail/u/0/auth']) assert.equal(signedInPage('gmail',href,'Inbox Compose'),false)
  assert.equal(signedInPage('gradescope','https://www.gradescope.com/','Log in to Gradescope'),false)
  assert.equal(signedInPage('gradescope','https://www.gradescope.com/courses/123','Assignments',true),false)
})
test('Gradescope remembers only a Brightspace course page, never an expiring SSO launch token', () => {
  assert.equal(brightspaceCourse('https://brightspace.nyu.edu/d2l/home/123?token=secret'),'https://brightspace.nyu.edu/d2l/home/123')
  for (const href of ['https://brightspace.nyu.edu/d2l/le/lti/launch?token=secret','https://evil.test/d2l/home/123','https://brightspace.nyu.edu/logout']) assert.equal(brightspaceCourse(href),null)
})
test('Albert remembers an exact portal dashboard without query/session data',()=>{
 const url='https://sis.portal.nyu.edu/psp/ihprod/EMPLOYEE/EMPL/h/'
 assert.equal(albertLanding(url+'?session=private'),url)
 for(const value of ['https://sis.portal.nyu.edu.evil.test/psp/home/','https://sis.portal.nyu.edu/login','https://sis.portal.nyu.edu/psp/login/','https://user:pass@sis.portal.nyu.edu/psp/home/'])assert.equal(albertLanding(value),null)
})
