import dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:3000';

async function runTests() {
  console.log('=== Starting E2E Verification Tests ===');
  
  // Randomize credentials to prevent database email/matric collision
  const suffix = Math.random().toString(36).substring(2, 8);
  const repEmail = `rep-${suffix}@studysync.com`;
  const repMatric = `REPMAT-${suffix.toUpperCase()}`;
  const studentEmail = `student-${suffix}@studysync.com`;
  const studentMatric = `STUDMAT-${suffix.toUpperCase()}`;

  let repInviteCode = '';
  let repId = '';
  let studentId = '';
  let repToken = '';
  let studentToken = '';
  let lecturerToken = '';
  let lecturerId = '';
  let courseId = '';
  let qrToken = '';

  try {
    // 1. Sign up Rep
    console.log(`\n[Step 1] Signing up new Class Representative (${repEmail})...`);
    const repSignupRes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Representative',
        email: repEmail,
        matric: repMatric,
        password: 'Password123',
        role: 'rep',
        signupKey: 'StudySyncRep2026'
      })
    });
    const repSignupData = await repSignupRes.json();
    if (!repSignupRes.ok) {
      throw new Error(`Rep Signup failed: ${JSON.stringify(repSignupData)}`);
    }
    console.log('✔ Rep Signup Success:', repSignupData);
    repInviteCode = repSignupData.inviteCode;

    // 2. Sign up Student
    console.log(`\n[Step 2] Signing up new Student (${studentEmail}) using Rep invite code...`);
    const studentSignupRes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Student',
        email: studentEmail,
        matric: studentMatric,
        password: 'Password123',
        role: 'student',
        inviteCode: repInviteCode
      })
    });
    const studentSignupData = await studentSignupRes.json();
    if (!studentSignupRes.ok) {
      throw new Error(`Student Signup failed: ${JSON.stringify(studentSignupData)}`);
    }
    console.log('✔ Student Signup Success:', studentSignupData);

    // 3. Try Login as Student (should fail with 403)
    console.log('\n[Step 3] Trying to login as student before approval (should fail)...');
    const studentFailRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: studentMatric,
        password: 'Password123'
      })
    });
    const studentFailData = await studentFailRes.json();
    if (studentFailRes.status === 403) {
      console.log('✔ Student login blocked as expected:', studentFailData.message);
    } else {
      console.error(`❌ Error: Expected 403 status, got ${studentFailRes.status}: ${JSON.stringify(studentFailData)}`);
      process.exit(1);
    }

    // 4. Login as Rep to get Token
    console.log('\n[Step 4] Logging in as Representative...');
    const repLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: repEmail,
        password: 'Password123'
      })
    });
    const repLoginData = await repLoginRes.json();
    if (!repLoginRes.ok) {
      throw new Error(`Rep Login failed: ${JSON.stringify(repLoginData)}`);
    }
    repToken = repLoginData.token;
    repId = repLoginData.userId;
    console.log(`✔ Rep login success. Token length: ${repToken.length}, Rep ID: ${repId}`);

    // 5. Approve Student as Rep
    console.log('\n[Step 5] Approving student as Representative...');
    // Get student list first to obtain studentId
    const studentsRes = await fetch(`${API_URL}/students`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${repToken}` }
    });
    const studentsData = await studentsRes.json();
    if (!studentsRes.ok) {
      throw new Error(`Failed to fetch representative's student roster: ${JSON.stringify(studentsData)}`);
    }
    const targetStudent = studentsData.find(s => s.matric === studentMatric);
    if (!targetStudent) {
      throw new Error("Test student not found in representative's roster.");
    }
    studentId = targetStudent._id;
    console.log(`✔ Found Student MongoDB ID: ${studentId}`);

    const approveRes = await fetch(`${API_URL}/students/${studentId}/approve`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${repToken}` 
      }
    });
    const approveData = await approveRes.json();
    if (!approveRes.ok) {
      throw new Error(`Student approval failed: ${JSON.stringify(approveData)}`);
    }
    console.log('✔ Student Approved success response:', approveData);

    // 6. Try Login as Student again (should succeed now)
    console.log('\n[Step 6] Logging in as approved student (should succeed)...');
    const studentLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: studentMatric,
        password: 'Password123'
      })
    });
    const studentLoginData = await studentLoginRes.json();
    if (!studentLoginRes.ok) {
      throw new Error(`Student Login failed: ${JSON.stringify(studentLoginData)}`);
    }
    studentToken = studentLoginData.token;
    console.log('✔ Student login success. Token length:', studentToken.length);

    // 7. Login as Lecturer
    console.log('\n[Step 7] Logging in as Lecturer (Jane Smith)...');
    const lecturerLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'lecturer@studysync.com',
        password: 'LecturerPassword2026'
      })
    });
    const lecturerLoginData = await lecturerLoginRes.json();
    if (!lecturerLoginRes.ok) {
      throw new Error(`Lecturer Login failed: ${JSON.stringify(lecturerLoginData)}`);
    }
    lecturerToken = lecturerLoginData.token;
    lecturerId = lecturerLoginData.userId;
    console.log(`✔ Lecturer login success. ID: ${lecturerId}`);

    // 8. Allocate Course
    console.log('\n[Step 8] Allocating Course to Rep group...');
    const courseRes = await fetch(`${API_URL}/courses`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lecturerToken}` 
      },
      body: JSON.stringify({
        code: `CSC-E2E-${suffix.toUpperCase()}`,
        name: 'Introduction to E2E Testing',
        repId: repId
      })
    });
    const courseData = await courseRes.json();
    if (!courseRes.ok) {
      throw new Error(`Course Allocation failed: ${JSON.stringify(courseData)}`);
    }
    courseId = courseData._id;
    console.log(`✔ Course Allocated successfully. ID: ${courseId}`);

    // 9. Start Attendance Session (Lecturer side)
    console.log('\n[Step 9] Starting Attendance Session (Lecturer)...');
    const sessionRes = await fetch(`${API_URL}/attendance/session`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lecturerToken}` 
      },
      body: JSON.stringify({
        courseId: courseId,
        latitude: 6.5244,
        longitude: 3.3792,
        timeLimit: 10,
        radius: 100
      })
    });
    const sessionData = await sessionRes.json();
    if (!sessionRes.ok) {
      throw new Error(`Starting Session failed: ${JSON.stringify(sessionData)}`);
    }
    qrToken = sessionData.qrToken;
    console.log('✔ Attendance Session Started successfully. QR Token:', qrToken);

    // 10. Submit Attendance (Student check-in within range)
    console.log('\n[Step 10] Checking in Student (within 100m range)...');
    const checkinRes = await fetch(`${API_URL}/attendance/submit`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}` 
      },
      body: JSON.stringify({
        qrToken: qrToken,
        latitude: 6.5245, // very close to 6.5244
        longitude: 3.3793 // very close to 3.3792
      })
    });
    const checkinData = await checkinRes.json();
    if (!checkinRes.ok) {
      throw new Error(`Check-in failed: ${JSON.stringify(checkinData)}`);
    }
    console.log('✔ Attendance Checked In Success:', checkinData);

    // 11. Try checking in student again (should fail with duplicate error)
    console.log('\n[Step 11] Checking in Student again (should fail due to duplicate)...');
    const doubleCheckinRes = await fetch(`${API_URL}/attendance/submit`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}` 
      },
      body: JSON.stringify({
        qrToken: qrToken,
        latitude: 6.5245,
        longitude: 3.3793
      })
    });
    const doubleCheckinData = await doubleCheckinRes.json();
    if (doubleCheckinRes.status === 400) {
      console.log('✔ Duplicate blocked successfully:', doubleCheckinData.error);
    } else {
      console.error(`❌ Error: Expected duplicate error status 400, got ${doubleCheckinRes.status}: ${JSON.stringify(doubleCheckinData)}`);
      process.exit(1);
    }

    // 12. Create another session and test distance block
    console.log('\n[Step 12] Starting a second session to test distance block...');
    const sessionRes2 = await fetch(`${API_URL}/attendance/session`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lecturerToken}` 
      },
      body: JSON.stringify({
        courseId: courseId,
        latitude: 6.5244,
        longitude: 3.3792,
        timeLimit: 10,
        radius: 100
      })
    });
    const sessionData2 = await sessionRes2.json();
    if (!sessionRes2.ok) {
      throw new Error(`Starting second session failed: ${JSON.stringify(sessionData2)}`);
    }
    const qrToken2 = sessionData2.qrToken;
    
    console.log('Checking in Student far away (should fail)...');
    const farCheckinRes = await fetch(`${API_URL}/attendance/submit`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}` 
      },
      body: JSON.stringify({
        qrToken: qrToken2,
        latitude: 7.5244, // far away
        longitude: 4.3792
      })
    });
    const farCheckinData = await farCheckinRes.json();
    if (farCheckinRes.status === 400) {
      console.log('✔ Distance check blocked successfully:', farCheckinData.error);
    } else {
      console.error(`❌ Error: Expected distance block status 400, got ${farCheckinRes.status}: ${JSON.stringify(farCheckinData)}`);
      process.exit(1);
    }

    console.log('\n=======================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('=======================================');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  } finally {
    // Cleanup Database purely via REST API
    console.log('\nCleaning up test data via HTTP APIs...');
    try {
      if (courseId && lecturerToken) {
        console.log('Cascade deleting Course and attendance records...');
        const courseDelRes = await fetch(`${API_URL}/courses/${courseId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${lecturerToken}` }
        });
        console.log(`Course delete response status: ${courseDelRes.status}`);
      }

      if (repId) {
        console.log('Logging in as Admin to clean up representative and students...');
        const adminLoginRes = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: 'admin@studysync.com',
            password: 'AdminPassword2026'
          })
        });
        if (adminLoginRes.ok) {
          const adminLoginData = await adminLoginRes.json();
          const adminToken = adminLoginData.token;
          
          const repDelRes = await fetch(`${API_URL}/admin/reps/${repId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
          });
          console.log(`Representative delete response status: ${repDelRes.status}`);
        } else {
          console.error('Failed to log in as Admin for cleanup.');
        }
      }
      console.log('✔ Database Cleaned Up Successfully.');
    } catch (err) {
      console.error('Failed to cleanup database:', err);
    }
    process.exit(0);
  }
}

runTests();
