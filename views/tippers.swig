{% extends 'layout.swig' %}

{% block title %}Tippers - Kothique Chaturbate Backend{% endblock %}

{% block content %}
  <a href="/">home</a>

  <ol>
    {% for tipper in tippers %}
      <li>{{ tipper.username }} - {{ tipper.amount }}</li>
    {% endfor %}
  </ol>
{% endblock %}
