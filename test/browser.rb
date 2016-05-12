require "watir-webdriver"

module Browser
  @@browser = nil

  def setup
    super
    @@browser.cookies.clear if @@browser
  end

  def browser
    @@browser ||= Browser.new_browser
  end

  def self.new_browser
    browser = Watir::Browser.new(:chrome)
    browser.extend RelativeBrowser

    screen_width = browser.execute_script("return screen.width")
    screen_height = browser.execute_script("return screen.height")
    browser.window.resize_to(800, 600)
    browser.window.move_to(screen_width - 800, 0)

    at_exit { browser.close }

    browser
  end

  module RelativeBrowser
    def goto(path)
      super("#{ENV["TEST_URL"]}#{path}")
    end
  end
end
