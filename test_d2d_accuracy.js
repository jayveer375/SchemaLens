// Test D2D accuracy with Library Management System
const BACKEND_URL = 'http://localhost:3000';

async function testLibraryAccuracy() {
  console.log('🧪 Testing D2D Schema Accuracy - Library Management System\n');
  
  const testCases = [
    {
      name: "Clear Library Description",
      input: "Online Library Management System with users who can borrow books. Track book loans, due dates, and member information. Books have ISBN, title, author. Users have membership IDs and contact info.",
      expectedEntities: ["User", "Book", "Loan"],
      shouldNotHave: ["images", "image_shares", "content_items", "subscriptions", "comments"]
    },
    {
      name: "Ambiguous Input",
      input: "Some kind of system",
      expectedBehavior: "should request clarification",
      shouldBeAmbiguous: true
    },
    {
      name: "Hospital System", 
      input: "Hospital management with patients scheduling appointments with doctors. Track patient medical records and treatment history.",
      expectedEntities: ["Patient", "Doctor", "Appointment"],
      shouldNotHave: ["users", "content", "images"]
    }
  ];

  for (const testCase of testCases) {
    console.log(`📋 Test: ${testCase.name}`);
    console.log(`Input: "${testCase.input}"`);
    
    try {
      // Step 1: Analyze
      const formData = new FormData();
      formData.append('text', testCase.input);
      
      const analyzeRes = await fetch(`${BACKEND_URL}/api/d2d/analyze-text`, {
        method: 'POST',
        body: formData
      });
      
      const analyzeData = await analyzeRes.json();
      console.log(`📊 Analysis Result:`);
      console.log(`   Domain: ${analyzeData.extracted?.domain || 'unknown'}`);
      console.log(`   Confidence: ${analyzeData.confidence}`);
      console.log(`   Entities found: ${analyzeData.extracted?.entities?.length || 0}`);
      
      if (analyzeData.extracted?.entities) {
        analyzeData.extracted.entities.forEach(entity => {
          console.log(`     - ${entity.name} (confidence: ${entity.confidence})`);
          if (entity.evidence) console.log(`       Evidence: "${entity.evidence.slice(0, 50)}..."`);
        });
      }

      // Check validation
      if (analyzeData.extracted?.validation) {
        const val = analyzeData.extracted.validation;
        console.log(`🔍 Validation:`);
        console.log(`   Is ambiguous: ${val.is_ambiguous || false}`);
        console.log(`   Needs clarification: ${val.needs_clarification || false}`);
        if (val.ambiguity_reason) {
          console.log(`   Reason: ${val.ambiguity_reason}`);
        }
      }

      // Step 2: Generate ER diagram if entities found
      if (analyzeData.extracted?.entities?.length > 0 && !analyzeData.extracted.validation?.is_ambiguous) {
        console.log(`\n🎨 Generating ER Diagram...`);
        
        const generateFormData = new FormData();
        generateFormData.append('diagram_type', 'er');
        generateFormData.append('text', testCase.input);
        generateFormData.append('extracted', JSON.stringify(analyzeData.extracted));
        
        const generateRes = await fetch(`${BACKEND_URL}/api/d2d/generate`, {
          method: 'POST',
          body: generateFormData
        });
        
        const generateData = await generateRes.json();
        if (generateData.mermaid_syntax) {
          console.log(`✅ Generated Schema:`);
          console.log(generateData.mermaid_syntax.split('\n').slice(0, 10).join('\n') + '\n...');
          
          // Validate against expected entities
          if (testCase.expectedEntities) {
            const schema = generateData.mermaid_syntax.toUpperCase();
            const foundExpected = testCase.expectedEntities.filter(entity => 
              schema.includes(entity.toUpperCase())
            );
            const foundUnwanted = testCase.shouldNotHave?.filter(entity => 
              schema.includes(entity.toUpperCase())
            ) || [];
            
            console.log(`📈 Accuracy Check:`);
            console.log(`   Expected entities found: ${foundExpected.length}/${testCase.expectedEntities.length}`);
            console.log(`   ✅ Found: ${foundExpected.join(', ')}`);
            if (foundUnwanted.length > 0) {
              console.log(`   ❌ Unwanted entities: ${foundUnwanted.join(', ')}`);
            } else {
              console.log(`   ✅ No unwanted entities`);
            }
          }
        }
      } else {
        console.log(`⏭️  Skipping generation - insufficient/ambiguous entities`);
      }
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
  }
}

// Run if backend is available
testLibraryAccuracy().catch(err => {
  console.log('❌ Test failed - make sure backend is running on :8000');
  console.log('Run: python app.py');
});