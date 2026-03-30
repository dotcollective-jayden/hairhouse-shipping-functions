# Campaigns Conditions
# =============
# - Rename Rendr 
# - Dangerous goods hide express
# - Dangerous goods hide all shipping options
# - Hide rendr if PO Box or Parcel Locker
# - Free standard shipping over $70
# - $5 express shipping over $70
# - Free standard shipping for Platinum Members
# - Rendr / Hairhouse cost mapping function - 0km - 10km set rate $9.99 over 10km addtional $1.40 max range 50km.
# *** NOTE: Rendr $9.99 mapping works based on the response rate rendr sends up, if this functionality breaks we need to check the response
# *** we are getting from rendr, if this doesnt align with the cent values in the map it means costing has changed on rendrs side.
# *** map values in this script align with rendrs spread sheet costings as of 25th Feb 2025.
# =============
# Updated 15th Jul 2025

customer = Input.cart.customer

Input.shipping_rates.each do |shipping_rate|
    # Print shipping rate name
    # puts "Shipping Rate Name: #{shipping_rate.name}"

    if shipping_rate.name && shipping_rate.name.include?("Rendr Flexible")
        shipping_rate.change_name("3hr Delivery")
    end
    
    if shipping_rate.name && shipping_rate.name.include?("Rendr Fast")
        shipping_rate.change_name("3hr Delivery")
    end
    
    if shipping_rate.name && shipping_rate.name.include?("Rendr Delivery Fast")
        shipping_rate.change_name("3hr Delivery")
    end
end

class Campaign
  def initialize(condition, *qualifiers)
    @condition = (condition.to_s + '?').to_sym
    @qualifiers = PostCartAmountQualifier ? [] : [] rescue qualifiers.compact
    @line_item_selector = qualifiers.last unless @line_item_selector
    qualifiers.compact.each do |qualifier|
      is_multi_select = qualifier.instance_variable_get(:@conditions).is_a?(Array)
      if is_multi_select
        qualifier.instance_variable_get(:@conditions).each do |nested_q|
          @post_amount_qualifier = nested_q if nested_q.is_a?(PostCartAmountQualifier)
          @qualifiers << qualifier
        end
      else
        @post_amount_qualifier = qualifier if qualifier.is_a?(PostCartAmountQualifier)
        @qualifiers << qualifier
      end
    end if @qualifiers.empty?
  end

  def qualifies?(cart)
    return true if @qualifiers.empty?
    @unmodified_line_items = cart.line_items.map do |item|
      new_item = item.dup
      new_item.instance_variables.each do |var|
        val = item.instance_variable_get(var)
        new_item.instance_variable_set(var, val.dup) if val.respond_to?(:dup)
      end
      new_item
    end if @post_amount_qualifier
    @qualifiers.send(@condition) do |qualifier|
      is_selector = false
      if qualifier.is_a?(Selector) || qualifier.instance_variable_get(:@conditions).any? { |q| q.is_a?(Selector) }
        is_selector = true
      end rescue nil
      if is_selector
        raise "Missing line item match type" if @li_match_type.nil?
        cart.line_items.send(@li_match_type) do |item|
          next false if item.nil?
          qualifier.match?(item)
        end
      else
        qualifier.match?(cart, @line_item_selector)
      end
    end
  end

  def run_with_hooks(cart)
    before_run(cart) if respond_to?(:before_run)
    run(cart)
    after_run(cart)
  end

  def after_run(cart)
    @discount.apply_final_discount if @discount && @discount.respond_to?(:apply_final_discount)
    revert_changes(cart) unless @post_amount_qualifier.nil? || @post_amount_qualifier.match?(cart)
  end

  def revert_changes(cart)
    cart.instance_variable_set(:@line_items, @unmodified_line_items)
  end
end

class ConditionallyHideRates < Campaign
	def initialize(condition, customer_qualifier, cart_qualifier, li_match_type, line_item_qualifier, rate_selector)
		super(condition, customer_qualifier, cart_qualifier, line_item_qualifier)
		@li_match_type = (li_match_type.to_s + '?').to_sym
		@rate_selector = rate_selector
	end

	def run(rates, cart)
		rates.delete_if { |rate| @rate_selector.match?(rate) } if qualifies?(cart)
	end
end

class Selector
	def partial_match(match_type, item_info, possible_matches)
		match_type = (match_type.to_s + '?').to_sym
		if item_info.kind_of?(Array)
			possible_matches.any? do |possibility|
				item_info.any? do |search|
					search.send(match_type, possibility)
				end
			end
		else
			possible_matches.any? do |possibility|
				item_info.send(match_type, possibility)
			end
		end
	end
end

class AndSelector
  def initialize(*conditions)
    @conditions = conditions.compact
  end

  def match?(item, selector = nil)
    @conditions.all? do |condition|
      if selector
        condition.match?(item, selector)
      else
        condition.match?(item)
      end
    end
  end
end

class ProductTagSelector < Selector
	def initialize(match_type, match_condition, tags)
		@match_condition = match_condition
		@invert = match_type == :does_not
		@tags = tags.map(&:downcase)
	end

	def match?(line_item)
		product_tags = line_item.variant.product.tags.to_a.map(&:downcase)
		case @match_condition
		when :match
			return @invert ^ ((@tags & product_tags).length > 0)
		else
			return @invert ^ partial_match(@match_condition, product_tags, @tags)
		end
	end
end

class RateNameSelector < Selector
	def initialize(match_type, match_condition, names)
		@match_condition = match_condition
		@invert = match_type == :does_not
		@names = names.map(&:downcase)
	end

	def match?(shipping_rate)
		name = shipping_rate.name.downcase
		case @match_condition
		when :match
			return @invert ^ @names.include?(name)
		else
			return @invert ^ partial_match(@match_condition, name, @names)
		end
	end
end

class FullAddressQualifier
  def initialize(addresses)
    @addresses = addresses
  end

  def match?(cart, selector = nil)
    return false if cart.shipping_address.nil?

    @addresses.any? do |accepted_address|
      match_type = accepted_address[:match_type].to_sym

      cart.shipping_address.to_hash.all? do |key, value|
        key = key.to_sym
        next true unless accepted_address[key]
        next true if accepted_address[key].empty?
        next false if value.nil?
        value.downcase!

        match = accepted_address[key].any? do |potential_address|
          potential_address.downcase!

          case match_type
          when :partial
            value.include?(potential_address)
          when :exact
            potential_address == value
          end
        end

        match
      end
    end
  end
end

class AllRatesSelector
	def match?(rate)
		return true
	end
end

class ShippingDiscount < Campaign
  def initialize(condition, customer_qualifier, cart_qualifier, li_match_type, line_item_qualifier, rate_selector, discount)
    super(condition, customer_qualifier, cart_qualifier, line_item_qualifier)
    @li_match_type = (li_match_type.to_s + '?').to_sym
    @rate_selector = rate_selector
    @discount = discount
  end

  def run(rates, cart)
    raise "Campaign requires a discount" unless @discount
    return unless qualifies?(cart)
    
    rates.each do |rate|
      next unless @rate_selector.nil? || @rate_selector.match?(rate)
      @discount.apply(rate)
    end
  end
end

class Qualifier
  def partial_match(match_type, item_info, possible_matches)
    match_type = (match_type.to_s + '?').to_sym
    if item_info.kind_of?(Array)
      possible_matches.any? do |possibility|
        item_info.any? do |search|
          search.send(match_type, possibility)
        end
      end
    else
      possible_matches.any? do |possibility|
        item_info.send(match_type, possibility)
      end
    end
  end

  def compare_amounts(compare, comparison_type, compare_to)
    case comparison_type
    when :greater_than
      return compare > compare_to
    when :greater_than_or_equal
      return compare >= compare_to
    when :less_than
      return compare < compare_to
    when :less_than_or_equal
      return compare <= compare_to
    when :equal_to
      return compare == compare_to
    else
      raise "Invalid comparison type"
    end
  end
end

class CartAmountQualifier < Qualifier
  def initialize(behaviour, comparison_type, amount)
    @behaviour = behaviour
    @comparison_type = comparison_type
    @amount = Money.new(cents: amount * 100)
  end

  def match?(cart, selector = nil)
    total = cart.subtotal_price
    if @behaviour == :item || @behaviour == :diff_item
      total = cart.line_items.reduce(Money.zero) do |total, item|
        total + (selector&.match?(item) ? item.line_price : Money.zero)
      end
    end
    case @behaviour
    when :cart, :item
      compare_amounts(total, @comparison_type, @amount)
    when :diff_cart
      compare_amounts(cart.subtotal_price_was - @amount, @comparison_type, total)
    when :diff_item
      original_line_total = cart.line_items.reduce(Money.zero) do |total, item|
        total + (selector&.match?(item) ? item.original_line_price : Money.zero)
      end
      compare_amounts(original_line_total - @amount, @comparison_type, total)
    end
  end
end

class RateCodeSelector < Selector
	def initialize(match_type, match_condition, codes)
		@match_condition = match_condition
		@invert = match_type == :does_not
		@codes = codes.map(&:downcase)
	end

	def match?(shipping_rate)
		code = shipping_rate.code.downcase
		case @match_condition
		when :match
			return @invert ^ @codes.include?(code)
		else
			return @invert ^ partial_match(@match_condition, code, @codes)
		end
	end
end

class CustomerTagQualifier < Qualifier
  def initialize(match_type, match_condition, tags)
    @match_condition = match_condition
    @invert = match_type == :does_not
    @tags = tags.map(&:downcase)
  end

  def match?(cart, selector = nil)
    return true if cart.customer.nil? && @invert
    return false if cart.customer.nil?
    customer_tags = cart.customer.tags.to_a.map(&:downcase)
    case @match_condition
      when :match
        return @invert ^ ((@tags & customer_tags).length > 0)
      else
        return @invert ^ partial_match(@match_condition, customer_tags, @tags)
    end
  end
end

class PercentageDiscount
	def initialize(percent, message)
		@percent = Decimal.new(percent) / 100
		@message = message
	end

	def apply(rate)
		rate.apply_discount(rate.price * @percent, { message: @message })
	end
end

class Campaign
  def initialize(condition, *qualifiers)
    @condition = (condition.to_s + '?').to_sym
    @qualifiers = PostCartAmountQualifier ? [] : [] rescue qualifiers.compact
    @post_amount_qualifiers = []
    @line_item_selector = qualifiers.last unless @line_item_selector
    qualifiers.compact.each do |qualifier|
      is_multi_select = qualifier.instance_variable_get(:@conditions).is_a?(Array)
      if is_multi_select
        qualifier.instance_variable_get(:@conditions).each do |nested_q|
          @post_amount_qualifiers << nested_q if nested_q.is_a?(PostCartAmountQualifier)
          @qualifiers << qualifier
        end
      else
        @post_amount_qualifiers << qualifier if qualifier.is_a?(PostCartAmountQualifier)
        @qualifiers << qualifier
      end
    end if @qualifiers.empty?
  end

  def qualifies?(cart)
    return true if @qualifiers.empty?
    @unmodified_line_items = cart.line_items.map do |item|
      new_item = item.dup
      new_item.instance_variables.each do |var|
        val = item.instance_variable_get(var)
        new_item.instance_variable_set(var, val.dup) if val.respond_to?(:dup)
      end
      new_item
    end unless @post_amount_qualifiers.empty?
    @qualifiers.send(@condition) do |qualifier|
      is_selector = false
      if qualifier.is_a?(Selector) || qualifier.instance_variable_get(:@conditions).any? { |q| q.is_a?(Selector) }
        is_selector = true
      end rescue nil
      if is_selector
        raise "Missing line item match type" if @li_match_type.nil?
        cart.line_items.send(@li_match_type) do |item|
          next false if item.nil?
          qualifier.match?(item)
        end
      else
        qualifier.match?(cart, @line_item_selector)
      end
    end
  end

  def run_with_hooks(cart)
    before_run(cart) if respond_to?(:before_run)
    run(cart)
    after_run(cart)
  end

  def after_run(cart)
    @discount.apply_final_discount if @discount && @discount.respond_to?(:apply_final_discount)
    revert_changes(cart) unless @post_amount_qualifiers.empty? || @post_amount_qualifiers.all? { |q| q.match?(cart) }
  end

  def revert_changes(cart)
    cart.instance_variable_set(:@line_items, @unmodified_line_items)
  end
end

class ShippingDiscount < Campaign
	def initialize(condition, customer_qualifier, cart_qualifier, li_match_type, line_item_qualifier, rate_selector, discount)
		super(condition, customer_qualifier, cart_qualifier, line_item_qualifier)
		@li_match_type = (li_match_type.to_s + '?').to_sym
		@rate_selector = rate_selector
		@discount = discount
	end

	def run(rates, cart)
		raise "Campaign requires a discount" unless @discount
		return unless qualifies?(cart)

		rates.each do |rate|
			next unless @rate_selector.nil? || @rate_selector.match?(rate)
			@discount.apply(rate)
		end
	end
end

class CustomerEmailQualifier < Qualifier
  def initialize(match_type, match_condition, emails)
    @invert = match_type == :does_not
    @match_condition = match_condition
    @emails = emails.map(&:downcase)
  end

  def match?(cart, selector = nil)
    return false if cart.customer&.email.nil?
    customer_email = cart.customer.email
    case @match_condition
      when :match
        return @invert ^ @emails.include?(customer_email)
      else
        return @invert ^ partial_match(@match_condition, customer_email, @emails)
    end
  end
end

class Qualifier
  def partial_match(match_type, item_info, possible_matches)
    match_type = (match_type.to_s + '?').to_sym
    if item_info.kind_of?(Array)
      possible_matches.any? do |possibility|
        item_info.any? do |search|
          search.send(match_type, possibility)
        end
      end
    else
      possible_matches.any? do |possibility|
        item_info.send(match_type, possibility)
      end
    end
  end

  def compare_amounts(compare, comparison_type, compare_to)
    case comparison_type
    when :greater_than
      return compare > compare_to
    when :greater_than_or_equal
      return compare >= compare_to
    when :less_than
      return compare < compare_to
    when :less_than_or_equal
      return compare <= compare_to
    when :equal_to
      return compare == compare_to
    else
      raise "Invalid comparison type"
    end
  end
end

class ReducedCartAmountQualifier < Qualifier
  def initialize(comparison_type, amount)
    @comparison_type = comparison_type
    @amount = Money.new(cents: amount * 100)
  end

  def match?(cart, selector = nil)
    total = case cart.discount_code
            when CartDiscount::Percentage
              if cart.subtotal_price >= cart.discount_code.minimum_order_amount
                cart_subtotal_without_gc = cart.line_items.reduce(Money.zero) do |total, item|
                  total + (item.variant.product.gift_card? ? Money.zero : item.line_price)
                end
                gift_card_amount = cart.subtotal_price - cart_subtotal_without_gc
                cart_subtotal_without_gc * ((Decimal.new(100) - cart.discount_code.percentage) / 100) + gift_card_amount
              else
                cart.subtotal_price
              end
            when CartDiscount::FixedAmount
              if cart.subtotal_price >= cart.discount_code.minimum_order_amount
                [cart.subtotal_price - cart.discount_code.amount, Money.zero].max
              else
                cart.subtotal_price
              end
            else
              cart.subtotal_price
            end

    compare_amounts(total, @comparison_type, @amount)
  end
end

class Selector
	def partial_match(match_type, item_info, possible_matches)
		match_type = (match_type.to_s + '?').to_sym
		if item_info.kind_of?(Array)
			possible_matches.any? do |possibility|
				item_info.any? do |search|
					search.send(match_type, possibility)
				end
			end
		else
			possible_matches.any? do |possibility|
				item_info.send(match_type, possibility)
			end
		end
	end
end

class RateNameSelector < Selector
	def initialize(match_type, match_condition, names)
		@match_condition = match_condition
		@invert = match_type == :does_not
		@names = names.map(&:downcase)
	end

	def match?(shipping_rate)
		name = shipping_rate.name.downcase
		case @match_condition
		when :match
			return @invert ^ @names.include?(name)
		else
			return @invert ^ partial_match(@match_condition, name, @names)
		end
	end
end

class PercentageDiscount
  def initialize(percent, message)
    @percent = Decimal.new(percent) / 100
    @message = message
  end

  def apply(rate)
    rate.apply_discount(rate.price * @percent, { message: @message })
  end
end

class FixedDiscount
  def initialize(amount, message)
    @amount = Money.new(cents: amount * 100)
    @message = message
  end

  def apply(rate)
    discount_amount = rate.price - @amount < Money.zero ? rate.price : @amount
    rate.apply_discount(discount_amount, { message: @message })
  end
end

class FixedPriceDiscount
  def initialize(amount, message)
    @amount = Money.new(cents: amount * 100)
    @message = message
  end

  def apply(rate)
    discount_amount = @amount > rate.price ? rate.price : rate.price - @amount
    rate.apply_discount(discount_amount, { message: @message })
  end
end

# Mapping of Rendr response costs to Hairhouse costs to build discount.
RATE_MAPPING = {
  1099 => 999, 1237 => 999, 1374 => 999, 1512 => 999, 1649 => 999, 1787 => 999,
  1924 => 1139, 2062 => 1279, 2199 => 1419, 2337 => 1559, 2474 => 1699, 2612 => 1839, 
  2749 => 1979, 2887 => 2119, 3024 => 2259, 3162 => 2399, 3299 => 2539, 3437 => 2679, 
  3574 => 2819, 3712 => 2959, 3849 => 3099, 3987 => 3239, 4124 => 3379, 4262 => 3519, 
  4399 => 3659, 4537 => 3799, 4674 => 3939, 4812 => 4079, 4949 => 4219, 5087 => 4359, 
  5224 => 4499, 5362 => 4639, 5499 => 4779, 5637 => 4919, 5774 => 5059, 5912 => 5199, 
  6049 => 5339, 6187 => 5479, 6324 => 5619, 6462 => 5759, 6599 => 5899, 6737 => 6039, 
  6874 => 6179, 7012 => 6319, 7149 => 6459, 7287 => 6599
}

# Custom class to create a discount based on the Rendr response and Hairhouse cost to customer.
class RendrFixedDiscount
  def initialize(message)
    @message = message
  end

  def apply(rate)

    cents = rate.price.cents.to_s.to_i
    mapping = RATE_MAPPING[cents]

    if mapping
      custom_rate = Money.new(cents: mapping)
    else
      custom_rate = Money.new(cents: cents)
    end

    discount_amount = rate.price - custom_rate
    
    # puts "Rendr Response: #{rate.price}"
    # puts "Covert to cents: #{cents}"
    # puts "Map Value?: #{mapping}"
    # puts "Check rate: #{custom_rate}"
    # puts "Check discount: #{discount_amount}"
    
    rate.apply_discount(discount_amount, { message: @message })
  end
end

CAMPAIGNS = [
  ShippingDiscount.new(
    :all,
    nil,
    CartAmountQualifier.new(
      :cart,
      :greater_than,
      70
    ),
    :any,
    nil,
    RateCodeSelector.new(
      :does,
      :include,
      ["brauz-rendr-delivery"]
    ),
    RendrFixedDiscount.new(
      "If ordered before 2pm, next day if after 2pm"
    )
  ),
  ConditionallyHideRates.new(
    :all,
    nil,
    FullAddressQualifier.new(
      [
        {:address1 => ["PO Box"], :address2 => [], :phone => [], :city => [], :province_code => [], :country_code => [], :zip => [], :match_type => "partial"},	
        {:address1 => ["P.O. Box"], :address2 => [], :phone => [], :city => [], :province_code => [], :country_code => [], :zip => [], :match_type => "partial"},
        {:address1 => ["Post Office Box"], :address2 => [], :phone => [], :city => [], :province_code => [], :country_code => [], :zip => [], :match_type => "partial"},
        {:address1 => ["Parcel Locker"], :address2 => [], :phone => [], :city => [], :province_code => [], :country_code => [], :zip => [], :match_type => "partial"},
        {:address1 => ["Parcel Collect"], :address2 => [], :phone => [], :city => [], :province_code => [], :country_code => [], :zip => [], :match_type => "partial"},	
        {:address1 => ["Locked Box"], :address2 => [], :phone => [], :city => [], :province_code => [], :country_code => [], :zip => [], :match_type => "partial"},	
        {:address1 => ["Locked Bag"], :address2 => [], :phone => [], :city => [], :province_code => [], :country_code => [], :zip => [], :match_type => "partial"},	
      ]
    ),
    :any,
    nil,
    RateNameSelector.new(
      :does,
      :match,
      ["3hr Delivery"]
    )
  ),
  ConditionallyHideRates.new(
    :all,
    nil,
    nil,
    :any,
    ProductTagSelector.new(
      :does,
      :match,
      ["Dangerous Goods"]
    ),
    RateNameSelector.new(
      :does,
      :include,
      ["Express Delivery"]
    )
  ),
  ConditionallyHideRates.new(
    :all,
    nil,
    FullAddressQualifier.new(
      [{:address1 => ["PO Box"], :address2 => [], :phone => [], :city => [], :province_code => [], :country_code => [], :zip => [], :match_type => "partial"},	{:address1 => ["Parcel Locker"], :address2 => [], :phone => [], :city => [], :province_code => [], :country_code => [], :zip => [], :match_type => "partial"},	{:address1 => ["P.O. Box"], :address2 => [], :phone => [], :city => [], :province_code => [], :country_code => [], :zip => [], :match_type => "partial"},{:address1 => [], :address2 => [], :phone => [], :city => [], :province_code => ["TAS"], :country_code => [], :zip => [], :match_type => "partial"}]
    ),
    :any,
    ProductTagSelector.new(
      :does,
      :match,
      ["Dangerous Goods"]
    ),
    AllRatesSelector.new(),
  ),
  ShippingDiscount.new(
    :all,
    CustomerTagQualifier.new(
      :does,
      :match,
      ["Platinum Member"]
    ),
    nil,
    :any,
    nil,
    RateNameSelector.new(
      :does,
      :include,
      ["Standard Delivery"]
    ),
    PercentageDiscount.new(
      100,
      "Platinum Free Shipping 2-6 business days"
    )
  ),
  ShippingDiscount.new(
    :any,
    nil,
    ReducedCartAmountQualifier.new(
      :greater_than_or_equal,
      150
    ),
    :any,
    nil,
    RateNameSelector.new(
      :does,
      :match,
      ["Express Delivery"]
    ),
    PercentageDiscount.new(
      100,
      "Free Express Shipping Orders $150+"
    )
  ),
  ShippingDiscount.new(
    :any,
    nil,
    ReducedCartAmountQualifier.new(
      :greater_than_or_equal,
      70
    ),
    :any,
    nil,
    RateNameSelector.new(
      :does,
      :match,
      ["Express Delivery"]
    ),
    FixedPriceDiscount.new(
      5,
      "$5 Express Shipping for orders $70+"
    )
  ),
  ShippingDiscount.new(
    :any,
    nil,
    ReducedCartAmountQualifier.new(
      :greater_than_or_equal,
      70
    ),
    :any,
    nil,
    RateNameSelector.new(
      :does,
      :match,
      ["Standard Delivery"]
    ),
    PercentageDiscount.new(
      100,
      "Free Standard Shipping over $70"
    )
  )
].freeze

CAMPAIGNS.each do |campaign|
    campaign.run(Input.shipping_rates, Input.cart)
end

Output.shipping_rates = Input.shipping_rates