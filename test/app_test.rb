require_relative "./setup"

describe "Front page" do
  include Browser

  it "must show beta warning" do
    browser.goto "/"
    browser.div(:text => /Hea kasutaja/).present?.must_equal true
  end

  it "must not show beta warning twice" do
    browser.goto "/"
    browser.div(:id => "dear_user_dialog").button(:title => /close/i).click
    browser.goto "/"
    browser.div(:id => "dear_user_dialog").present?.must_equal false
  end
end
