document.getElementById("backBtn").addEventListener("click", () => {
  window.location.href = "../../popup/App.html";
});

const searchBtn = document.getElementById("searchBtn");
const searchQuery = document.getElementById("searchQuery");
const loadingIndicator = document.getElementById("loadingIndicator");
const searchResults = document.getElementById("searchResults");
const profilesList = document.getElementById("profilesList");
const generateBtn = document.getElementById("generateBtn");
const output = document.getElementById("output");
const copyBtn = document.getElementById("copyBtn");

// Manual input fields
const nameInput = document.getElementById("name");
const titleInput = document.getElementById("title");
const companyInput = document.getElementById("company");
const locationInput = document.getElementById("location");

let selectedProfile = null;

/**
 * Search for LinkedIn profiles
 */
searchBtn.addEventListener("click", async () => {
  const query = searchQuery.value.trim();
  
  if (!query) {
    alert("Please enter a search query");
    return;
  }

  // Show loading indicator
  loadingIndicator.style.display = "block";
  searchResults.style.display = "none";
  profilesList.innerHTML = "";
  output.value = "";
  copyBtn.style.display = "none";

  try {
    const response = await fetch("http://localhost:3000/api/linkedin/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 10 })
    });

    const data = await response.json();
    
    loadingIndicator.style.display = "none";

    if (data.profiles && data.profiles.length > 0) {
      displayProfiles(data.profiles);
      searchResults.style.display = "block";
    } else {
      alert("No profiles found. Try a different search query.");
    }

  } catch (err) {
    console.error(err);
    loadingIndicator.style.display = "none";
    alert("Error searching profiles. Make sure the backend server is running.");
  }
});

/**
 * Display search results as profile cards
 */
function displayProfiles(profiles) {
  profilesList.innerHTML = "";

  profiles.forEach((profile, index) => {
    const profileCard = document.createElement("div");
    profileCard.className = "profile-card";
    
    profileCard.innerHTML = `
      <div class="profile-header">
        <h4>${escapeHtml(profile.name)}</h4>
        <span class="profile-badge">${index + 1}</span>
      </div>
      <p class="profile-title">${escapeHtml(profile.title)}</p>
      <p class="profile-company">${escapeHtml(profile.company)}</p>
      <p class="profile-location">${escapeHtml(profile.location)}</p>
      <div class="profile-actions">
        <button class="button small select-profile-btn" data-index="${index}">Select & Generate</button>
        <a href="${escapeHtml(profile.linkedinUrl)}" target="_blank" rel="noopener" class="button small">View Profile</a>
      </div>
    `;

    profilesList.appendChild(profileCard);
  });

  // Add event listeners to select buttons
  document.querySelectorAll(".select-profile-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const index = parseInt(e.target.dataset.index);
      selectedProfile = profiles[index];
      
      // Populate manual input fields
      nameInput.value = selectedProfile.name;
      titleInput.value = selectedProfile.title;
      companyInput.value = selectedProfile.company;
      locationInput.value = selectedProfile.location;
      
      // Highlight selected card
      document.querySelectorAll(".profile-card").forEach(card => {
        card.classList.remove("selected");
      });
      e.target.closest(".profile-card").classList.add("selected");
      
      // Generate message automatically
      await generateMessage(selectedProfile);
    });
  });
}

/**
 * Generate AI message for a profile
 */
async function generateMessage(profile) {
  output.value = "Generating AI message...";
  copyBtn.style.display = "none";

  try {
    const response = await fetch("http://localhost:3000/api/linkedin/generate-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profile.name,
        title: profile.title,
        company: profile.company,
        location: profile.location
      })
    });

    const data = await response.json();
    output.value = data.message;
    copyBtn.style.display = "block";

  } catch (err) {
    console.error(err);
    output.value = "Error generating message.";
  }
}

/**
 * Manual generate button
 */
generateBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const title = titleInput.value.trim();
  const company = companyInput.value.trim();
  const location = locationInput.value.trim();

  if (!name || !title) {
    alert("Name and title are required");
    return;
  }

  await generateMessage({ name, title, company, location });
});

/**
 * Copy to clipboard button
 */
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    copyBtn.textContent = "Copied!";
    setTimeout(() => {
      copyBtn.textContent = "Copy to Clipboard";
    }, 2000);
  } catch (err) {
    // Fallback for older browsers
    output.select();
    document.execCommand("copy");
    copyBtn.textContent = "Copied!";
    setTimeout(() => {
      copyBtn.textContent = "Copy to Clipboard";
    }, 2000);
  }
});

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Allow Enter key to trigger search
 */
searchQuery.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    searchBtn.click();
  }
});