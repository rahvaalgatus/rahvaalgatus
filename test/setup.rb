require "bundler/setup"
require "minitest/autorun"
require "minitest/pride"
require "minitest/reporters"
require_relative "./browser"

MiniTest::Unit::TestCase.define_singleton_method(:test_order) do :alpha end
MiniTest::Reporters.use! MiniTest::Reporters::SpecReporter.new
