document.getElementById("backBtn").addEventListener("click", () => {
  window.location.href = "../../popup/App.html";
});

const generateBtn = document.getElementById("generateBtn");
const output = document.getElementById("output");

generateBtn.addEventListener("click", async () => {
  const name = document.getElementById("name").value;
  const title = document.getElementById("title").value;
  const company = document.getElementById("company").value;
  const location = document.getElementById("location").value;

  output.value = "Generating AI message...";

  try {
    const response = await fetch("http://localhost:3000/api/linkedin/generate-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, title, company, location })
    });

    const data = await response.json();
    output.value = data.message;

  } catch (err) {
    console.error(err);
    output.value = "Error generating message.";
  }
});
